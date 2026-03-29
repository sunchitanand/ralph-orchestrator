use serde_json::json;
use tempfile::TempDir;

use ralph_api::{ApiConfig, RpcRuntime};

fn test_runtime() -> (RpcRuntime, TempDir) {
    let workspace = tempfile::tempdir().expect("tempdir");
    let mut config = ApiConfig::default();
    config.workspace_root = workspace.path().to_path_buf();
    config.project_store_path = Some(workspace.path().join("projects.json"));
    let runtime = RpcRuntime::new(config).expect("runtime");
    (runtime, workspace)
}

#[test]
fn project_list_includes_default_workspace() {
    let (rt, ws) = test_runtime();
    let result = rt
        .invoke_method("r1", "project.list", json!({}), "test", None)
        .expect("project.list should succeed");
    let projects = result["projects"].as_array().unwrap();
    assert_eq!(projects.len(), 1, "should contain the default workspace");
    assert_eq!(projects[0]["path"], ws.path().to_str().unwrap());
    assert!(projects[0]["isDefault"].as_bool().unwrap_or(false));
}

#[test]
fn project_add_and_list_round_trip() {
    let (rt, ws) = test_runtime();
    let dir = ws.path().to_str().unwrap();

    let added = rt
        .invoke_method(
            "r1",
            "project.add",
            json!({ "path": dir }),
            "test",
            Some("idem-add1".into()),
        )
        .expect("project.add should succeed");
    assert!(added["project"]["id"].is_string());
    assert_eq!(added["project"]["path"], dir);

    let list = rt
        .invoke_method("r2", "project.list", json!({}), "test", None)
        .expect("project.list should succeed");
    let projects = list["projects"].as_array().unwrap();
    // Default workspace + the added project
    assert_eq!(projects.len(), 2);
    // First is default, second is the added one
    assert!(projects[0]["isDefault"].as_bool().unwrap_or(false));
    assert_eq!(projects[1]["path"], dir);
}

#[test]
fn project_remove_deletes_project() {
    let (rt, ws) = test_runtime();
    let dir = ws.path().to_str().unwrap();

    let added = rt
        .invoke_method(
            "r1",
            "project.add",
            json!({ "path": dir }),
            "test",
            Some("idem-add2".into()),
        )
        .unwrap();
    let id = added["project"]["id"].as_str().unwrap().to_string();

    rt.invoke_method(
        "r2",
        "project.remove",
        json!({ "id": id }),
        "test",
        Some("idem-rem1".into()),
    )
    .expect("project.remove should succeed");

    let list = rt
        .invoke_method("r3", "project.list", json!({}), "test", None)
        .unwrap();
    // Only default workspace remains after removing the added project
    let projects = list["projects"].as_array().unwrap();
    assert_eq!(projects.len(), 1);
    assert!(projects[0]["isDefault"].as_bool().unwrap_or(false));
}

#[test]
fn project_browse_lists_directory() {
    let (rt, ws) = test_runtime();
    std::fs::write(ws.path().join("ralph.yml"), "test: true").unwrap();
    std::fs::create_dir(ws.path().join("subdir")).unwrap();

    let result = rt
        .invoke_method(
            "r1",
            "project.browse",
            json!({ "path": ws.path().to_str().unwrap() }),
            "test",
            None,
        )
        .expect("project.browse should succeed");

    let entries = result["entries"].as_array().unwrap();
    assert!(!entries.is_empty());
    // subdir should appear (dirs first)
    assert!(entries.iter().any(|e| e["name"] == "subdir" && e["isDirectory"] == true));
}

#[test]
fn project_add_invalid_path_returns_error() {
    let (rt, _ws) = test_runtime();
    let result = rt.invoke_method(
        "r1",
        "project.add",
        json!({ "path": "/nonexistent/path/that/does/not/exist" }),
        "test",
        Some("idem-bad".into()),
    );
    assert!(result.is_err());
}

#[test]
fn project_browse_detects_ralph_yml() {
    let (rt, ws) = test_runtime();
    // Create a subdirectory with ralph.yml inside it
    let sub = ws.path().join("my-project");
    std::fs::create_dir(&sub).unwrap();
    std::fs::write(sub.join("ralph.yml"), "test: true").unwrap();
    // Create another subdirectory without ralph.yml
    std::fs::create_dir(ws.path().join("plain-dir")).unwrap();

    let result = rt
        .invoke_method(
            "r1",
            "project.browse",
            json!({ "path": ws.path().to_str().unwrap() }),
            "test",
            None,
        )
        .expect("project.browse should succeed");

    let entries = result["entries"].as_array().unwrap();
    let my_proj = entries.iter().find(|e| e["name"] == "my-project").unwrap();
    assert!(my_proj["hasRalphYml"].as_bool().unwrap());
    let plain = entries.iter().find(|e| e["name"] == "plain-dir").unwrap();
    assert!(!plain["hasRalphYml"].as_bool().unwrap());
}

#[test]
fn project_unknown_submethod_returns_error() {
    let (rt, _ws) = test_runtime();
    let result = rt.invoke_method("r1", "project.unknown", json!({}), "test", None);
    assert!(result.is_err());
}
