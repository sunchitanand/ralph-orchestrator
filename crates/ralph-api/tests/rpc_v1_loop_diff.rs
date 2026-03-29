use std::fs;
use std::path::Path;

use anyhow::{Result, ensure};
use reqwest::Client;
use serde_json::{Value, json};
use tempfile::TempDir;
use tokio::net::TcpListener;
use tokio::sync::oneshot;

use ralph_api::{ApiConfig, RpcRuntime, serve_with_listener};

struct TestServer {
    base_url: String,
    shutdown: Option<oneshot::Sender<()>>,
    join: tokio::task::JoinHandle<anyhow::Result<()>>,
    #[allow(dead_code)]
    workspace: TempDir,
}

impl TestServer {
    async fn start_with_workspace(mut config: ApiConfig, workspace: TempDir) -> Self {
        config.workspace_root = workspace.path().to_path_buf();

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("listener should bind");
        let local_addr = listener
            .local_addr()
            .expect("listener local addr should exist");
        let runtime = RpcRuntime::new(config).expect("runtime should initialize");
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

        let join = tokio::spawn(async move {
            serve_with_listener(listener, runtime, async move {
                let _ = shutdown_rx.await;
            })
            .await
        });

        Self {
            base_url: format!("http://{local_addr}"),
            shutdown: Some(shutdown_tx),
            join,
            workspace,
        }
    }

    async fn stop(mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        let result = self.join.await.expect("server task should join");
        result.expect("server should shutdown cleanly");
    }
}

async fn post_rpc(client: &Client, server: &TestServer, body: &Value) -> Result<(u16, Value)> {
    let response = client
        .post(format!("{}/rpc/v1", server.base_url))
        .header("content-type", "application/json")
        .json(body)
        .send()
        .await?;

    let status = response.status().as_u16();
    let payload = response.json::<Value>().await?;
    Ok((status, payload))
}

fn rpc_request(id: &str, method: &str, params: Value) -> Value {
    json!({
        "apiVersion": "v1",
        "id": id,
        "method": method,
        "params": params,
    })
}

fn init_git_repo(path: &Path) -> Result<()> {
    run_git(path, &["init", "--initial-branch=main"])?;
    run_git(path, &["config", "user.email", "test@test.local"])?;
    run_git(path, &["config", "user.name", "Test User"])?;
    fs::write(path.join("README.md"), "# Test\n")?;
    run_git(path, &["add", "README.md"])?;
    run_git(path, &["commit", "-m", "Initial commit"])?;
    Ok(())
}

fn run_git(path: &Path, args: &[&str]) -> Result<()> {
    let status = std::process::Command::new("git")
        .args(args)
        .current_dir(path)
        .status()?;
    ensure!(status.success(), "git {:?} failed", args);
    Ok(())
}

#[tokio::test]
async fn loop_diff_returns_file_changes_for_primary() -> Result<()> {
    let workspace = tempfile::tempdir()?;
    init_git_repo(workspace.path())?;

    // Make changes on a branch so there's a diff against main
    run_git(workspace.path(), &["checkout", "-b", "work"])?;
    fs::write(workspace.path().join("new_file.rs"), "fn main() {}\n")?;
    // Append-only change: original content preserved, new line added (0 deletions)
    fs::write(workspace.path().join("README.md"), "# Test\nNew line\n")?;
    run_git(workspace.path(), &["add", "."])?;
    run_git(workspace.path(), &["commit", "-m", "Add changes"])?;

    let server = TestServer::start_with_workspace(ApiConfig::default(), workspace).await;
    let client = Client::new();

    let diff_req = rpc_request(
        "req-diff-1",
        "loop.diff",
        json!({ "id": "(primary)" }),
    );
    let (status, payload) = post_rpc(&client, &server, &diff_req).await?;

    assert_eq!(status, 200);
    let files = payload["result"]["files"].as_array().expect("files array");
    assert!(files.len() >= 2, "expected at least 2 changed files, got {}", files.len());

    // Check that we have the expected files
    let paths: Vec<&str> = files.iter().filter_map(|f| f["path"].as_str()).collect();
    assert!(paths.contains(&"new_file.rs"), "missing new_file.rs in {paths:?}");
    assert!(paths.contains(&"README.md"), "missing README.md in {paths:?}");

    // Check status values are correct (not heuristic-based)
    let new_file = files.iter().find(|f| f["path"] == "new_file.rs").unwrap();
    assert_eq!(new_file["status"].as_str().unwrap(), "added");
    assert!(new_file["additions"].as_u64().unwrap() > 0);
    assert!(new_file["diff"].as_str().unwrap().contains("fn main()"));

    let readme = files.iter().find(|f| f["path"] == "README.md").unwrap();
    assert_eq!(readme["status"].as_str().unwrap(), "modified");

    server.stop().await;
    Ok(())
}

#[tokio::test]
async fn loop_diff_returns_empty_when_no_changes() -> Result<()> {
    let workspace = tempfile::tempdir()?;
    init_git_repo(workspace.path())?;

    // Stay on main, no changes — diff against self should be empty
    let server = TestServer::start_with_workspace(ApiConfig::default(), workspace).await;
    let client = Client::new();

    let diff_req = rpc_request(
        "req-diff-empty-1",
        "loop.diff",
        json!({ "id": "(primary)" }),
    );
    let (status, payload) = post_rpc(&client, &server, &diff_req).await?;

    assert_eq!(status, 200);
    let files = payload["result"]["files"].as_array().expect("files array");
    assert!(files.is_empty(), "expected empty files for no-change diff");

    server.stop().await;
    Ok(())
}

#[tokio::test]
async fn loop_diff_unknown_loop_returns_error() -> Result<()> {
    let workspace = tempfile::tempdir()?;
    init_git_repo(workspace.path())?;

    let server = TestServer::start_with_workspace(ApiConfig::default(), workspace).await;
    let client = Client::new();

    let diff_req = rpc_request(
        "req-diff-unknown-1",
        "loop.diff",
        json!({ "id": "nonexistent-loop" }),
    );
    let (status, _payload) = post_rpc(&client, &server, &diff_req).await?;

    // Should return an error (404 or 500) for unknown loop
    assert_ne!(status, 200, "expected error for unknown loop");

    server.stop().await;
    Ok(())
}
