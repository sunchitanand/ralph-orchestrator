use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::errors::ApiError;
use crate::loop_support::now_ts;

mod storage;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskListParams {
    pub status: Option<String>,
    pub include_archived: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCreateParams {
    pub id: String,
    pub title: String,
    pub status: Option<String>,
    pub priority: Option<u8>,
    pub blocked_by: Option<String>,
    pub auto_execute: Option<bool>,
    pub merge_loop_prompt: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TaskUpdateInput {
    pub id: String,
    pub title: Option<String>,
    pub status: Option<String>,
    pub priority: Option<u8>,
    pub blocked_by: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRecord {
    pub id: String,
    pub title: String,
    pub status: String,
    pub priority: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocked_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub queued_task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_loop_prompt: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runner_pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loop_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRunResult {
    pub success: bool,
    pub queued_task_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task: Option<TaskRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRunAllResult {
    pub enqueued: u64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStatusResult {
    pub is_queued: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub queue_position: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runner_pid: Option<u32>,
}

pub struct TaskDomain {
    store_path: PathBuf,
    workspace_root: PathBuf,
    ralph_command: String,
    tasks: BTreeMap<String, TaskRecord>,
    queue_counter: u64,
}

impl TaskDomain {
    pub fn new(workspace_root: impl AsRef<Path>, ralph_command: impl Into<String>) -> Self {
        let workspace_root = workspace_root.as_ref();
        let store_path = workspace_root.join(".ralph/api/tasks-v1.json");
        let mut domain = Self {
            store_path,
            workspace_root: workspace_root.to_path_buf(),
            ralph_command: ralph_command.into(),
            tasks: BTreeMap::new(),
            queue_counter: 0,
        };
        domain.load();
        domain
    }

    pub fn list(&mut self, params: TaskListParams) -> Vec<TaskRecord> {
        self.sync_process_state();
        let include_archived = params.include_archived.unwrap_or(false);
        let mut tasks = self.sorted_tasks();

        if let Some(status) = params.status {
            tasks.retain(|task| task.status == status);
        }

        if !include_archived {
            tasks.retain(|task| task.archived_at.is_none());
        }

        tasks
    }

    pub fn get(&mut self, id: &str) -> Result<TaskRecord, ApiError> {
        self.sync_process_state();
        self.tasks
            .get(id)
            .cloned()
            .ok_or_else(|| task_not_found_error(id))
    }

    pub fn ready(&self) -> Vec<TaskRecord> {
        let unblocking_ids = self.unblocking_ids();
        let mut tasks: Vec<_> = self
            .tasks
            .values()
            .filter(|task| task.status == "open" && task.archived_at.is_none())
            .filter(|task| {
                task.blocked_by
                    .as_ref()
                    .is_none_or(|blocker_id| unblocking_ids.contains(blocker_id))
            })
            .cloned()
            .collect();

        tasks.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        tasks
    }

    pub fn create(&mut self, params: TaskCreateParams) -> Result<TaskRecord, ApiError> {
        if self.tasks.contains_key(&params.id) {
            return Err(
                ApiError::conflict(format!("Task with id '{}' already exists", params.id))
                    .with_details(serde_json::json!({ "taskId": params.id })),
            );
        }

        let requested_status = params.status.unwrap_or_else(|| "open".to_string());
        let auto_execute = params.auto_execute.unwrap_or(true);

        if auto_execute && requested_status != "open" {
            return Err(ApiError::invalid_params(
                "task.create autoExecute=true is only valid when status is 'open'",
            )
            .with_details(serde_json::json!({
                "taskId": params.id,
                "status": requested_status,
                "autoExecute": auto_execute,
            })));
        }

        let now = now_ts();
        let completed_at = is_terminal_status(&requested_status).then_some(now.clone());

        let task = TaskRecord {
            id: params.id.clone(),
            title: params.title,
            status: requested_status,
            priority: params.priority.unwrap_or(2).clamp(1, 5),
            blocked_by: params.blocked_by,
            archived_at: None,
            queued_task_id: None,
            merge_loop_prompt: params.merge_loop_prompt,
            created_at: now.clone(),
            updated_at: now,
            completed_at,
            error_message: None,
            runner_pid: None,
            loop_id: None,
        };

        let task_id = task.id.clone();
        self.tasks.insert(task_id.clone(), task);

        let should_auto_execute = auto_execute
            && self
                .tasks
                .get(&task_id)
                .is_some_and(|task| task.blocked_by.is_none() && task.status == "open");

        if should_auto_execute {
            let _ = self.run(&task_id)?;
        } else {
            self.persist()?;
        }

        self.get(&task_id)
    }

    pub fn update(&mut self, input: TaskUpdateInput) -> Result<TaskRecord, ApiError> {
        let now = now_ts();
        let task = self
            .tasks
            .get_mut(&input.id)
            .ok_or_else(|| task_not_found_error(&input.id))?;

        if let Some(title) = input.title {
            task.title = title;
        }
        if let Some(status) = input.status {
            task.status = status;

            if is_terminal_status(&task.status) {
                task.completed_at = Some(now.clone());
                task.queued_task_id = None;
                task.runner_pid = None;
            } else {
                task.completed_at = None;
                if !matches!(task.status.as_str(), "pending" | "running") {
                    task.queued_task_id = None;
                    task.runner_pid = None;
                }
            }

            if task.status != "failed" {
                task.error_message = None;
            }
        }
        if let Some(priority) = input.priority {
            task.priority = priority.clamp(1, 5);
        }
        if let Some(blocked_by) = input.blocked_by {
            task.blocked_by = blocked_by;
        }

        task.updated_at = now;
        self.persist()?;
        self.get(&input.id)
    }

    pub fn close(&mut self, id: &str) -> Result<TaskRecord, ApiError> {
        self.transition_task(id, "closed")
    }

    pub fn archive(&mut self, id: &str) -> Result<TaskRecord, ApiError> {
        let task = self
            .tasks
            .get_mut(id)
            .ok_or_else(|| task_not_found_error(id))?;

        task.archived_at = Some(now_ts());
        task.updated_at = now_ts();
        self.persist()?;
        self.get(id)
    }

    pub fn unarchive(&mut self, id: &str) -> Result<TaskRecord, ApiError> {
        let task = self
            .tasks
            .get_mut(id)
            .ok_or_else(|| task_not_found_error(id))?;

        task.archived_at = None;
        task.updated_at = now_ts();
        self.persist()?;
        self.get(id)
    }

    pub fn delete(&mut self, id: &str) -> Result<(), ApiError> {
        let task = self.tasks.get(id).ok_or_else(|| task_not_found_error(id))?;

        if !matches!(task.status.as_str(), "failed" | "closed") {
            return Err(ApiError::precondition_failed(format!(
                "Cannot delete task in '{}' state. Only failed or closed tasks can be deleted.",
                task.status
            ))
            .with_details(serde_json::json!({
                "taskId": id,
                "status": task.status,
                "allowedStatuses": ["failed", "closed"]
            })));
        }

        self.tasks.remove(id);
        self.persist()?;
        Ok(())
    }

    pub fn clear(&mut self) -> Result<(), ApiError> {
        self.tasks.clear();
        self.persist()?;
        Ok(())
    }

    pub fn run(&mut self, id: &str) -> Result<TaskRunResult, ApiError> {
        let queued_task_id = self.queue_task(id)?;

        let title = self.get(id)?.title.clone();
        let prompt = self
            .get(id)?
            .merge_loop_prompt
            .clone()
            .unwrap_or(title);

        match std::process::Command::new(&self.ralph_command)
            .args(["run", "-p", &prompt])
            .current_dir(&self.workspace_root)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
        {
            Ok(child) => {
                let pid = child.id();
                if let Some(task) = self.tasks.get_mut(id) {
                    task.runner_pid = Some(pid);
                    let _ = self.persist();
                }
            }
            Err(error) => {
                tracing::warn!(
                    task_id = id,
                    command = %self.ralph_command,
                    %error,
                    "failed to spawn runner process for task"
                );
            }
        }

        Ok(TaskRunResult {
            success: true,
            queued_task_id,
            task: Some(self.get(id)?),
        })
    }

    pub fn run_all(&mut self) -> TaskRunAllResult {
        let ready_task_ids: Vec<String> = self.ready().into_iter().map(|task| task.id).collect();
        let mut enqueued = 0_u64;
        let mut errors = Vec::new();

        for task_id in ready_task_ids {
            match self.run(&task_id) {
                Ok(_) => {
                    enqueued = enqueued.saturating_add(1);
                }
                Err(error) => {
                    errors.push(format!("{task_id}: {}", error.message));
                }
            }
        }

        TaskRunAllResult { enqueued, errors }
    }

    pub fn retry(&mut self, id: &str) -> Result<TaskRunResult, ApiError> {
        {
            let task = self
                .tasks
                .get_mut(id)
                .ok_or_else(|| task_not_found_error(id))?;

            if task.status != "failed" {
                return Err(
                    ApiError::precondition_failed("Only failed tasks can be retried").with_details(
                        serde_json::json!({
                            "taskId": id,
                            "status": task.status,
                        }),
                    ),
                );
            }

            let now = now_ts();
            task.status = "open".to_string();
            task.queued_task_id = None;
            task.completed_at = None;
            task.error_message = None;
            task.updated_at = now;
        }

        self.run(id)
    }

    pub fn cancel(&mut self, id: &str, force: bool) -> Result<TaskRecord, ApiError> {
        let task = self
            .tasks
            .get_mut(id)
            .ok_or_else(|| task_not_found_error(id))?;

        if !matches!(task.status.as_str(), "pending" | "running") {
            return Err(ApiError::precondition_failed(
                "Only running or pending tasks can be cancelled",
            )
            .with_details(serde_json::json!({
                "taskId": id,
                "status": task.status,
            })));
        }

        let now = now_ts();
        task.status = "failed".to_string();
        task.completed_at = Some(now.clone());
        task.updated_at = now;
        task.error_message = Some(if force {
            "Task force-stopped by user".to_string()
        } else {
            "Task stopped by user".to_string()
        });
        task.queued_task_id = None;
        task.runner_pid = None;

        self.persist()?;
        self.get(id)
    }

    pub fn status(&self, id: &str) -> TaskStatusResult {
        let Some(task) = self.tasks.get(id) else {
            return TaskStatusResult {
                is_queued: false,
                queue_position: None,
                runner_pid: None,
            };
        };

        let is_queued =
            task.queued_task_id.is_some() && matches!(task.status.as_str(), "pending" | "running");

        let queue_position = if is_queued {
            self.queue_position(id)
        } else {
            None
        };

        let runner_pid = task.runner_pid;

        TaskStatusResult {
            is_queued,
            queue_position,
            runner_pid,
        }
    }


    /// Syncs process lifecycle state for all active tasks.
    ///
    /// For each task with a `runner_pid` and status "pending" or "running":
    /// 1. Resolves `loop_id` from the loop registry if not yet set
    /// 2. Checks process exit via waitpid (WNOHANG)
    /// 3. On exit: marks task closed (exit 0) or failed (non-zero)
    /// 4. If still alive and pending with a loop: promotes to "running"
    pub fn sync_process_state(&mut self) {
        use ralph_core::loop_registry::LoopRegistry;

        let registry = LoopRegistry::new(&self.workspace_root);
        let loop_entries = registry.list().unwrap_or_default();

        // Collect task IDs and PIDs to process (avoid borrow conflict)
        let active: Vec<(String, u32)> = self
            .tasks
            .values()
            .filter(|t| matches!(t.status.as_str(), "pending" | "running") && t.runner_pid.is_some())
            .map(|t| (t.id.clone(), t.runner_pid.unwrap()))
            .collect();

        let mut changed = false;

        for (task_id, pid) in active {
            let task = match self.tasks.get_mut(&task_id) {
                Some(t) => t,
                None => continue,
            };

            // Step 1: Resolve loop_id if not set
            if task.loop_id.is_none() {
                if let Some(entry) = loop_entries.iter().find(|e| e.pid == pid) {
                    task.loop_id = Some(entry.id.clone());
                    changed = true;
                }
            }

            // Step 2: Check process exit via waitpid
            match try_waitpid(pid) {
                WaitResult::Exited(0) => {
                    let now = now_ts();
                    task.status = "closed".to_string();
                    task.completed_at = Some(now.clone());
                    task.updated_at = now;
                    task.runner_pid = None;
                    task.queued_task_id = None;
                    task.error_message = None;
                    changed = true;
                }
                WaitResult::Exited(code) => {
                    let now = now_ts();
                    task.status = "failed".to_string();
                    task.completed_at = Some(now.clone());
                    task.updated_at = now;
                    task.runner_pid = None;
                    task.queued_task_id = None;
                    task.error_message = Some(format!("Process exited with code {code}"));
                    changed = true;
                }
                WaitResult::StillRunning => {
                    // Promote pending → running once loop is registered
                    if task.status == "pending" && task.loop_id.is_some() {
                        task.status = "running".to_string();
                        task.updated_at = now_ts();
                        changed = true;
                    }
                }
                WaitResult::NotOurChild => {
                    // Process was reparented (e.g., API restarted). Check liveness.
                    if !crate::loop_support::is_pid_alive(pid) {
                        let now = now_ts();
                        task.status = "failed".to_string();
                        task.completed_at = Some(now.clone());
                        task.updated_at = now;
                        task.runner_pid = None;
                        task.queued_task_id = None;
                        task.error_message = Some("Process exited (exit code unknown)".to_string());
                        changed = true;
                    }
                }
            }
        }

        if changed {
            let _ = self.persist();
        }
    }

    fn transition_task(&mut self, id: &str, status: &str) -> Result<TaskRecord, ApiError> {
        let task = self
            .tasks
            .get_mut(id)
            .ok_or_else(|| task_not_found_error(id))?;

        let now = now_ts();
        task.status = status.to_string();
        task.updated_at = now.clone();

        if is_terminal_status(status) {
            task.completed_at = Some(now);
            task.queued_task_id = None;
            task.runner_pid = None;
        } else {
            task.completed_at = None;
            if !matches!(status, "pending" | "running") {
                task.queued_task_id = None;
                task.runner_pid = None;
            }
        }

        if status != "failed" {
            task.error_message = None;
        }

        self.persist()?;
        self.get(id)
    }

    fn queue_task(&mut self, id: &str) -> Result<String, ApiError> {
        let queued_task_id = self.next_queued_task_id();
        let now = now_ts();

        let task = self
            .tasks
            .get_mut(id)
            .ok_or_else(|| task_not_found_error(id))?;

        if task.archived_at.is_some() {
            return Err(
                ApiError::precondition_failed("Cannot run archived task").with_details(
                    serde_json::json!({
                        "taskId": id,
                    }),
                ),
            );
        }

        if matches!(task.status.as_str(), "pending" | "running") {
            return Err(
                ApiError::precondition_failed("Task is already queued or running").with_details(
                    serde_json::json!({
                        "taskId": id,
                        "status": task.status
                    }),
                ),
            );
        }

        task.status = "pending".to_string();
        task.queued_task_id = Some(queued_task_id.clone());
        task.completed_at = None;
        task.error_message = None;
        task.runner_pid = None;
        task.loop_id = None;
        task.updated_at = now;
        self.persist()?;

        Ok(queued_task_id)
    }

    fn queue_position(&self, id: &str) -> Option<u64> {
        let mut queued: Vec<&TaskRecord> = self
            .tasks
            .values()
            .filter(|task| {
                task.queued_task_id.is_some()
                    && matches!(task.status.as_str(), "pending" | "running")
            })
            .collect();
        queued.sort_by(|a, b| a.updated_at.cmp(&b.updated_at));

        queued
            .iter()
            .position(|task| task.id == id)
            .map(|index| index as u64)
    }

    fn unblocking_ids(&self) -> HashSet<String> {
        self.tasks
            .values()
            .filter(|task| task.status == "closed" || task.archived_at.is_some())
            .map(|task| task.id.clone())
            .collect()
    }

    fn next_queued_task_id(&mut self) -> String {
        self.queue_counter = self.queue_counter.saturating_add(1);
        format!(
            "queued-{}-{:04x}",
            Utc::now().timestamp_millis(),
            self.queue_counter
        )
    }

    fn sorted_tasks(&self) -> Vec<TaskRecord> {
        let mut tasks: Vec<_> = self.tasks.values().cloned().collect();
        tasks.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        tasks
    }
}

fn task_not_found_error(task_id: &str) -> ApiError {
    ApiError::task_not_found(format!("Task with id '{task_id}' not found"))
        .with_details(serde_json::json!({ "taskId": task_id }))
}

fn is_terminal_status(status: &str) -> bool {
    matches!(status, "closed" | "failed")
}

enum WaitResult {
    Exited(i32),
    StillRunning,
    NotOurChild,
}

#[cfg(unix)]
fn try_waitpid(pid: u32) -> WaitResult {
    use nix::sys::wait::{waitpid, WaitPidFlag, WaitStatus};
    use nix::unistd::Pid;

    match waitpid(Pid::from_raw(pid as i32), Some(WaitPidFlag::WNOHANG)) {
        Ok(WaitStatus::Exited(_, code)) => WaitResult::Exited(code),
        Ok(WaitStatus::Signaled(_, _, _)) => WaitResult::Exited(1),
        Ok(WaitStatus::StillAlive) => WaitResult::StillRunning,
        Err(nix::errno::Errno::ECHILD) => WaitResult::NotOurChild,
        _ => WaitResult::StillRunning,
    }
}

#[cfg(not(unix))]
fn try_waitpid(_pid: u32) -> WaitResult {
    WaitResult::NotOurChild
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;
    use tempfile::TempDir;

    fn kill_pid(pid: u32) {
        let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
    }

    fn is_pid_alive(pid: u32) -> bool {
        Command::new("kill")
            .args(["-0", &pid.to_string()])
            .status()
            .is_ok_and(|s| s.success())
    }

    fn test_domain(workspace: &TempDir) -> TaskDomain {
        let script_path = workspace.path().join("fake-ralph");
        fs::write(&script_path, "#!/bin/sh\nsleep 300\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755)).unwrap();
        }
        TaskDomain::new(workspace.path(), script_path.to_str().unwrap())
    }

    fn create_open_task(domain: &mut TaskDomain, id: &str, title: &str) {
        domain
            .create(TaskCreateParams {
                id: id.to_string(),
                title: title.to_string(),
                status: Some("open".to_string()),
                priority: Some(2),
                blocked_by: None,
                auto_execute: Some(false),
                merge_loop_prompt: None,
            })
            .unwrap();
    }

    #[test]
    fn run_spawns_process_and_stores_pid() {
        let workspace = tempfile::tempdir().unwrap();
        let mut domain = test_domain(&workspace);
        create_open_task(&mut domain, "task-spawn-1", "Implement feature X");

        let result = domain.run("task-spawn-1").unwrap();
        assert!(result.success);

        let task = domain.get("task-spawn-1").unwrap();
        assert_eq!(task.status, "pending");
        assert!(task.runner_pid.is_some(), "runner_pid should be set after run()");

        kill_pid(task.runner_pid.unwrap());
    }

    #[test]
    fn run_stores_pid_that_is_alive() {
        let workspace = tempfile::tempdir().unwrap();
        let mut domain = test_domain(&workspace);
        create_open_task(&mut domain, "task-pid-alive-1", "Check PID");

        domain.run("task-pid-alive-1").unwrap();
        let task = domain.get("task-pid-alive-1").unwrap();
        let pid = task.runner_pid.expect("runner_pid should be set");

        assert!(is_pid_alive(pid), "spawned process should be alive");
        kill_pid(pid);
    }

    #[test]
    fn cancel_clears_runner_pid() {
        let workspace = tempfile::tempdir().unwrap();
        let mut domain = test_domain(&workspace);
        create_open_task(&mut domain, "task-cancel-pid-1", "Cancel me");

        domain.run("task-cancel-pid-1").unwrap();
        let pid = domain.get("task-cancel-pid-1").unwrap().runner_pid.unwrap();

        let cancelled = domain.cancel("task-cancel-pid-1", false).unwrap();
        assert_eq!(cancelled.status, "failed");
        assert!(cancelled.runner_pid.is_none(), "runner_pid should be cleared after cancel");

        kill_pid(pid);
    }

    #[test]
    fn retry_spawns_new_process() {
        let workspace = tempfile::tempdir().unwrap();
        let mut domain = test_domain(&workspace);
        create_open_task(&mut domain, "task-retry-1", "Retry me");

        domain.run("task-retry-1").unwrap();
        let first_pid = domain.get("task-retry-1").unwrap().runner_pid.unwrap();

        domain.cancel("task-retry-1", false).unwrap();
        let result = domain.retry("task-retry-1").unwrap();
        assert!(result.success);

        let second_pid = domain.get("task-retry-1").unwrap().runner_pid.expect("should have new pid");
        assert_ne!(first_pid, second_pid, "retry should spawn a new process");

        kill_pid(first_pid);
        kill_pid(second_pid);
    }

    #[test]
    fn sync_resolves_loop_id_from_registry() {
        use ralph_core::loop_registry::{LoopEntry, LoopRegistry};

        let workspace = tempfile::tempdir().unwrap();
        let mut domain = test_domain(&workspace);
        create_open_task(&mut domain, "task-sync-loop-1", "Resolve loop");

        domain.run("task-sync-loop-1").unwrap();
        let pid = domain.get("task-sync-loop-1").unwrap().runner_pid.unwrap();

        // Register a loop entry with the same PID as the spawned process
        let registry = LoopRegistry::new(workspace.path());
        let entry = LoopEntry::with_id("loop-test-1", "Resolve loop", None::<String>, workspace.path().display().to_string());
        // Overwrite PID to match the spawned process
        let mut entry = entry;
        entry.pid = pid;
        registry.register(entry).unwrap();

        domain.sync_process_state();

        let task = domain.get("task-sync-loop-1").unwrap();
        assert_eq!(task.loop_id.as_deref(), Some("loop-test-1"), "loop_id should be resolved from registry");

        kill_pid(pid);
    }

    #[test]
    fn sync_marks_completed_on_exit_zero() {
        let workspace = tempfile::tempdir().unwrap();
        let script_path = workspace.path().join("fake-ralph");
        fs::write(&script_path, "#!/bin/sh\nexit 0\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755)).unwrap();
        }
        let mut domain = TaskDomain::new(workspace.path(), script_path.to_str().unwrap());
        create_open_task(&mut domain, "task-exit0-1", "Exit zero");

        domain.run("task-exit0-1").unwrap();

        // Poll sync until the task transitions (process exits with 0)
        for _ in 0..50 {
            domain.sync_process_state();
            if domain.get("task-exit0-1").unwrap().status != "pending" {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        let task = domain.get("task-exit0-1").unwrap();
        assert_eq!(task.status, "closed", "task should be closed on exit 0");
        assert!(task.runner_pid.is_none(), "runner_pid should be cleared");
    }

    #[test]
    fn sync_marks_failed_on_nonzero_exit() {
        let workspace = tempfile::tempdir().unwrap();
        let script_path = workspace.path().join("fake-ralph");
        fs::write(&script_path, "#!/bin/sh\nexit 1\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755)).unwrap();
        }
        let mut domain = TaskDomain::new(workspace.path(), script_path.to_str().unwrap());
        create_open_task(&mut domain, "task-exit1-1", "Exit one");

        domain.run("task-exit1-1").unwrap();

        // Poll sync until the task transitions (process exits with 1)
        for _ in 0..50 {
            domain.sync_process_state();
            if domain.get("task-exit1-1").unwrap().status != "pending" {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        let task = domain.get("task-exit1-1").unwrap();
        assert_eq!(task.status, "failed", "task should be failed on non-zero exit");
        assert!(task.error_message.is_some(), "should have error message");
        assert!(task.runner_pid.is_none(), "runner_pid should be cleared");
    }

    #[test]
    fn sync_updates_pending_to_running_when_alive() {
        let workspace = tempfile::tempdir().unwrap();
        let mut domain = test_domain(&workspace);
        create_open_task(&mut domain, "task-alive-1", "Still running");

        domain.run("task-alive-1").unwrap();
        let task = domain.get("task-alive-1").unwrap();
        assert_eq!(task.status, "pending");
        let pid = task.runner_pid.unwrap();

        // Register a loop entry so sync can find it
        use ralph_core::loop_registry::{LoopEntry, LoopRegistry};
        let registry = LoopRegistry::new(workspace.path());
        let mut entry = LoopEntry::with_id("loop-alive-1", "Still running", None::<String>, workspace.path().display().to_string());
        entry.pid = pid;
        registry.register(entry).unwrap();

        domain.sync_process_state();

        let task = domain.get("task-alive-1").unwrap();
        assert_eq!(task.status, "running", "pending task with alive process and loop should become running");
        assert_eq!(task.loop_id.as_deref(), Some("loop-alive-1"));

        kill_pid(pid);
    }

    // Bug fix: list() must call sync_process_state() so frontend sees updated status
    #[test]
    fn list_syncs_process_state_on_exit() {
        let workspace = tempfile::tempdir().unwrap();
        let script_path = workspace.path().join("fake-ralph");
        fs::write(&script_path, "#!/bin/sh\nexit 0\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755)).unwrap();
        }
        let mut domain = TaskDomain::new(workspace.path(), script_path.to_str().unwrap());
        create_open_task(&mut domain, "task-list-sync-1", "List sync");

        domain.run("task-list-sync-1").unwrap();

        // Wait for process to exit
        for _ in 0..50 {
            std::thread::sleep(std::time::Duration::from_millis(50));
            let tasks = domain.list(TaskListParams { status: None, include_archived: None });
            let task = tasks.iter().find(|t| t.id == "task-list-sync-1").unwrap();
            if task.status != "pending" {
                break;
            }
        }

        // list() should have triggered sync — task should be closed
        let tasks = domain.list(TaskListParams { status: None, include_archived: None });
        let task = tasks.iter().find(|t| t.id == "task-list-sync-1").unwrap();
        assert_eq!(task.status, "closed", "list() should sync process state and detect exit 0");
    }

    // Bug fix: get() must call sync_process_state() so frontend sees updated status
    #[test]
    fn get_syncs_process_state_on_exit() {
        let workspace = tempfile::tempdir().unwrap();
        let script_path = workspace.path().join("fake-ralph");
        fs::write(&script_path, "#!/bin/sh\nexit 0\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755)).unwrap();
        }
        let mut domain = TaskDomain::new(workspace.path(), script_path.to_str().unwrap());
        create_open_task(&mut domain, "task-get-sync-1", "Get sync");

        domain.run("task-get-sync-1").unwrap();

        // Wait for process to exit, calling get() each time
        for _ in 0..50 {
            std::thread::sleep(std::time::Duration::from_millis(50));
            let task = domain.get("task-get-sync-1").unwrap();
            if task.status != "pending" {
                break;
            }
        }

        let task = domain.get("task-get-sync-1").unwrap();
        assert_eq!(task.status, "closed", "get() should sync process state and detect exit 0");
    }

    // Bug fix: retry() must clear loop_id so sync can re-resolve for new process
    #[test]
    fn retry_clears_loop_id() {
        let workspace = tempfile::tempdir().unwrap();
        let mut domain = test_domain(&workspace);
        create_open_task(&mut domain, "task-retry-lid-1", "Retry loop id");

        domain.run("task-retry-lid-1").unwrap();
        let pid = domain.get("task-retry-lid-1").unwrap().runner_pid.unwrap();

        // Manually set loop_id to simulate resolved state
        domain.tasks.get_mut("task-retry-lid-1").unwrap().loop_id = Some("old-loop".to_string());

        domain.cancel("task-retry-lid-1", false).unwrap();
        domain.retry("task-retry-lid-1").unwrap();

        let task = domain.get("task-retry-lid-1").unwrap();
        assert!(task.loop_id.is_none(), "retry should clear loop_id so sync can re-resolve");

        kill_pid(pid);
        if let Some(new_pid) = task.runner_pid {
            kill_pid(new_pid);
        }
    }
}
