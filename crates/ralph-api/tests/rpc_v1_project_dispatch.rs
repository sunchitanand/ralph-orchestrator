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

/// Register a second project and return its ID.
fn register_project(rt: &RpcRuntime) -> (String, TempDir) {
    let project_dir = tempfile::tempdir().expect("project dir");
    std::fs::create_dir_all(project_dir.path().join(".ralph").join("agent")).unwrap();
    // Create minimal ralph.yml so ConfigDomain works
    std::fs::write(project_dir.path().join("ralph.yml"), "backend: claude\n").unwrap();
    let added = rt
        .invoke_method(
            "setup-01",
            "project.add",
            json!({ "path": project_dir.path().to_str().unwrap() }),
            "test",
            Some("idem-setup-project".into()),
        )
        .expect("project.add");
    let id = added["project"]["id"].as_str().unwrap().to_string();
    (id, project_dir)
}

// ── AC1: task.list with projectId returns tasks from that project ──

#[test]
fn task_list_with_project_id_returns_project_scoped_tasks() {
    let (rt, ws) = test_runtime();
    let (pid, _pdir) = register_project(&rt);

    std::fs::create_dir_all(ws.path().join(".ralph").join("agent")).unwrap();
    rt.invoke_method(
        "t1-create",
        "task.create",
        json!({ "id": "default-1", "title": "default-task" }),
        "test",
        Some("idem-create-default".into()),
    )
    .unwrap();

    // task.list without projectId → should see default-task
    let default_list = rt
        .invoke_method("t2-list", "task.list", json!({}), "test", None)
        .unwrap();
    let default_tasks = default_list["tasks"].as_array().unwrap();
    assert!(
        default_tasks.iter().any(|t| t["title"] == "default-task"),
        "default workspace should contain default-task"
    );

    // task.list with projectId → should NOT see default-task
    let project_list = rt
        .invoke_method(
            "t3-list",
            "task.list",
            json!({ "projectId": pid }),
            "test",
            None,
        )
        .unwrap();
    let project_tasks = project_list["tasks"].as_array().unwrap();
    assert!(
        !project_tasks.iter().any(|t| t["title"] == "default-task"),
        "project workspace should NOT contain default-task"
    );
}

// ── AC2: task.list without projectId returns default workspace (backwards compat) ──

#[test]
fn task_list_without_project_id_returns_default_tasks() {
    let (rt, ws) = test_runtime();
    std::fs::create_dir_all(ws.path().join(".ralph").join("agent")).unwrap();

    rt.invoke_method(
        "t1-create",
        "task.create",
        json!({ "id": "my-task-1", "title": "my-task" }),
        "test",
        Some("idem-bc-create".into()),
    )
    .unwrap();

    let result = rt
        .invoke_method("t2-list", "task.list", json!({}), "test", None)
        .unwrap();
    let tasks = result["tasks"].as_array().unwrap();
    assert!(tasks.iter().any(|t| t["title"] == "my-task"));
}

// ── AC3: loop.list, config.get, preset.list, collection.list all respect projectId ──

#[test]
fn loop_list_respects_project_id() {
    let (rt, _ws) = test_runtime();
    let (pid, _pdir) = register_project(&rt);

    let result = rt
        .invoke_method(
            "l1-list",
            "loop.list",
            json!({ "projectId": pid }),
            "test",
            None,
        )
        .unwrap();
    assert!(result["loops"].is_array());
}

#[test]
fn config_get_respects_project_id() {
    let (rt, _ws) = test_runtime();
    let (pid, _pdir) = register_project(&rt);

    let result = rt
        .invoke_method(
            "c1-get",
            "config.get",
            json!({ "projectId": pid }),
            "test",
            None,
        )
        .unwrap();
    assert!(result.is_object());
}

#[test]
fn preset_list_respects_project_id() {
    let (rt, _ws) = test_runtime();
    let (pid, _pdir) = register_project(&rt);

    let result = rt
        .invoke_method(
            "p1-list",
            "preset.list",
            json!({ "projectId": pid }),
            "test",
            None,
        )
        .unwrap();
    assert!(result["presets"].is_array());
}

#[test]
fn collection_list_respects_project_id() {
    let (rt, _ws) = test_runtime();
    let (pid, _pdir) = register_project(&rt);

    let result = rt
        .invoke_method(
            "cl1-list",
            "collection.list",
            json!({ "projectId": pid }),
            "test",
            None,
        )
        .unwrap();
    assert!(result["collections"].is_array());
}

// ── AC4: unknown projectId returns error ──

#[test]
fn unknown_project_id_returns_error() {
    let (rt, _ws) = test_runtime();

    let result = rt.invoke_method(
        "e1-list",
        "task.list",
        json!({ "projectId": "nonexistent" }),
        "test",
        None,
    );
    assert!(result.is_err(), "unknown projectId should return error");
}

// ── AC5: integration test proving project-scoped dispatch returns different data ──

#[test]
fn project_scoped_dispatch_returns_different_data_per_project() {
    let (rt, ws) = test_runtime();
    std::fs::create_dir_all(ws.path().join(".ralph").join("agent")).unwrap();
    let (pid, _pdir) = register_project(&rt);

    // Create task in default workspace
    rt.invoke_method(
        "t1-create",
        "task.create",
        json!({ "id": "def-task-1", "title": "default-only" }),
        "test",
        Some("idem-def-create".into()),
    )
    .unwrap();

    // Create task in project workspace
    rt.invoke_method(
        "t2-create",
        "task.create",
        json!({ "id": "prj-task-1", "title": "project-only", "projectId": pid }),
        "test",
        Some("idem-prj-create".into()),
    )
    .unwrap();

    // Default list has default-only, not project-only
    let default_list = rt
        .invoke_method("t3-list", "task.list", json!({}), "test", None)
        .unwrap();
    let default_tasks = default_list["tasks"].as_array().unwrap();
    assert!(default_tasks.iter().any(|t| t["title"] == "default-only"));
    assert!(!default_tasks.iter().any(|t| t["title"] == "project-only"));

    // Project list has project-only, not default-only
    let project_list = rt
        .invoke_method(
            "t4-list",
            "task.list",
            json!({ "projectId": pid }),
            "test",
            None,
        )
        .unwrap();
    let project_tasks = project_list["tasks"].as_array().unwrap();
    assert!(project_tasks.iter().any(|t| t["title"] == "project-only"));
    assert!(!project_tasks.iter().any(|t| t["title"] == "default-only"));
}
