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
fn resolve_returns_default_domains_when_none() {
    let (rt, _ws) = test_runtime();
    let domains = rt.resolve_project_domains(None).expect("should resolve default");
    // Verify we can access all 6 domain types without error
    let _tasks = domains.tasks.lock().unwrap();
    let _loops = domains.loops.lock().unwrap();
    let _planning = domains.planning.lock().unwrap();
    let _collections = domains.collections.lock().unwrap();
    let _config = &domains.config;
    let _preset = &domains.preset;
}

#[test]
fn resolve_returns_default_domains_when_default_id() {
    let (rt, _ws) = test_runtime();
    let domains = rt
        .resolve_project_domains(Some("default"))
        .expect("should resolve 'default'");
    let _tasks = domains.tasks.lock().unwrap();
}

#[test]
fn resolve_lazily_creates_domains_for_registered_project() {
    let (rt, _ws) = test_runtime();

    // Register a project
    let project_dir = tempfile::tempdir().expect("project dir");
    let added = rt
        .invoke_method(
            "r1",
            "project.add",
            json!({ "path": project_dir.path().to_str().unwrap() }),
            "test",
            Some("idem-add".into()),
        )
        .expect("project.add");
    let project_id = added["project"]["id"].as_str().unwrap().to_string();

    // Resolve should lazily create domains for this project
    let domains = rt
        .resolve_project_domains(Some(&project_id))
        .expect("should resolve registered project");
    let _tasks = domains.tasks.lock().unwrap();
    let _loops = domains.loops.lock().unwrap();
    let _planning = domains.planning.lock().unwrap();
    let _collections = domains.collections.lock().unwrap();
    let _config = &domains.config;
    let _preset = &domains.preset;
}

#[test]
fn resolve_returns_error_for_unknown_project_id() {
    let (rt, _ws) = test_runtime();
    let result = rt.resolve_project_domains(Some("nonexistent-id"));
    assert!(result.is_err());
}

#[test]
fn resolve_caches_domains_across_calls() {
    let (rt, _ws) = test_runtime();

    let project_dir = tempfile::tempdir().expect("project dir");
    let added = rt
        .invoke_method(
            "r1",
            "project.add",
            json!({ "path": project_dir.path().to_str().unwrap() }),
            "test",
            Some("idem-add2".into()),
        )
        .expect("project.add");
    let project_id = added["project"]["id"].as_str().unwrap().to_string();

    // First resolve creates domains
    let d1 = rt
        .resolve_project_domains(Some(&project_id))
        .expect("first resolve");
    // Second resolve should return the same cached instances (Arc::ptr_eq)
    let d2 = rt
        .resolve_project_domains(Some(&project_id))
        .expect("second resolve");

    assert!(std::sync::Arc::ptr_eq(&d1.tasks, &d2.tasks));
}
