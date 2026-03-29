use serde_json::{Value, json};
use tracing::warn;

use super::{IdOnlyParams, RpcRuntime, TaskCancelParams};
use crate::collection_domain::{
    CollectionCreateParams, CollectionImportParams, CollectionUpdateParams,
};
use crate::config_domain::ConfigUpdateParams;
use crate::errors::ApiError;
use crate::loop_domain::{
    LoopDiffParams, LoopListParams, LoopRetryParams, LoopStopMergeParams,
    LoopTriggerMergeTaskParams,
};
use crate::planning_domain::{
    PlanningGetArtifactParams, PlanningRespondParams, PlanningStartParams,
};
use crate::project_domain::{ProjectAddParams, ProjectBrowseParams, ProjectRemoveParams};
use crate::protocol::{API_VERSION, RpcRequestEnvelope};
use crate::stream_domain::{StreamAckParams, StreamSubscribeParams, StreamUnsubscribeParams};
use crate::task_domain::{TaskCreateParams, TaskListParams, TaskUpdateInput};

fn extract_project_id(request: &RpcRequestEnvelope) -> Option<String> {
    request
        .params
        .get("projectId")
        .and_then(Value::as_str)
        .map(String::from)
}

impl RpcRuntime {
    pub(super) fn dispatch(
        &self,
        request: &RpcRequestEnvelope,
        principal: &str,
    ) -> Result<Value, ApiError> {
        let result = match request.method.as_str() {
            "system.health" => Ok(self.health_payload()),
            "system.version" => Ok(json!({
                "apiVersion": API_VERSION,
                "serverVersion": env!("CARGO_PKG_VERSION")
            })),
            "system.capabilities" => Ok(self.capabilities_payload()),
            method if method.starts_with("task.") => self.dispatch_task(request),
            method if method.starts_with("loop.") => self.dispatch_loop(request),
            method if method.starts_with("planning.") => self.dispatch_planning(request),
            method if method.starts_with("config.") => self.dispatch_config(request),
            method if method.starts_with("preset.") => self.dispatch_preset(request),
            method if method.starts_with("collection.") => self.dispatch_collection(request),
            method if method.starts_with("project.") => self.dispatch_project(request),
            method if method.starts_with("stream.") => self.dispatch_stream(request, principal),
            "_internal.publish" => self.dispatch_internal_publish(request),
            _ => {
                warn!(
                    method = %request.method,
                    "recognized method is not implemented in rpc runtime"
                );
                Err(ApiError::service_unavailable(format!(
                    "method '{}' is recognized but not implemented in rpc runtime",
                    request.method
                )))
            }
        };

        if let Ok(payload) = &result
            && !request.method.starts_with("stream.")
        {
            self.stream_domain()
                .publish_rpc_side_effect(&request.method, &request.params, payload);
        }

        result
    }

    fn dispatch_task(&self, request: &RpcRequestEnvelope) -> Result<Value, ApiError> {
        let domains = self.resolve_project_domains(extract_project_id(request).as_deref())?;
        let lock_tasks = || {
            domains
                .tasks
                .lock()
                .map_err(|_| ApiError::internal("task domain lock poisoned"))
        };
        match request.method.as_str() {
            "task.list" => {
                let params: TaskListParams = self.parse_params(request)?;
                let tasks = lock_tasks()?.list(params);
                Ok(json!({ "tasks": tasks }))
            }
            "task.get" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                let task = lock_tasks()?.get(&params.id)?;
                Ok(json!({ "task": task }))
            }
            "task.ready" => {
                let tasks = lock_tasks()?.ready();
                Ok(json!({ "tasks": tasks }))
            }
            "task.create" => {
                let params: TaskCreateParams = self.parse_params(request)?;
                let task = lock_tasks()?.create(params)?;
                Ok(json!({ "task": task }))
            }
            "task.update" => {
                let input = parse_task_update_input(request)?;
                let task = lock_tasks()?.update(input)?;
                Ok(json!({ "task": task }))
            }
            "task.close" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                let task = lock_tasks()?.close(&params.id)?;
                Ok(json!({ "task": task }))
            }
            "task.archive" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                let task = lock_tasks()?.archive(&params.id)?;
                Ok(json!({ "task": task }))
            }
            "task.unarchive" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                let task = lock_tasks()?.unarchive(&params.id)?;
                Ok(json!({ "task": task }))
            }
            "task.delete" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                lock_tasks()?.delete(&params.id)?;
                Ok(json!({ "success": true }))
            }
            "task.clear" => {
                lock_tasks()?.clear()?;
                Ok(json!({ "success": true }))
            }
            "task.run" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                let result = lock_tasks()?.run(&params.id)?;
                Ok(json!(result))
            }
            "task.run_all" => {
                let result = lock_tasks()?.run_all();
                Ok(json!(result))
            }
            "task.retry" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                let result = lock_tasks()?.retry(&params.id)?;
                Ok(json!(result))
            }
            "task.cancel" => {
                let params: TaskCancelParams = self.parse_params(request)?;
                let force = params.force.unwrap_or(false);
                let task = lock_tasks()?.cancel(&params.id, force)?;
                Ok(json!({ "task": task }))
            }
            "task.status" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                let status = lock_tasks()?.status(&params.id);
                Ok(json!(status))
            }
            _ => Err(ApiError::service_unavailable(format!(
                "method '{}' is recognized but not implemented",
                request.method
            ))),
        }
    }

    fn dispatch_loop(&self, request: &RpcRequestEnvelope) -> Result<Value, ApiError> {
        let domains = self.resolve_project_domains(extract_project_id(request).as_deref())?;
        let lock_loops = || {
            domains
                .loops
                .lock()
                .map_err(|_| ApiError::internal("loop domain lock poisoned"))
        };
        match request.method.as_str() {
            "loop.list" => {
                let params: LoopListParams = self.parse_params(request)?;
                let loops = lock_loops()?.list(params)?;
                Ok(json!({ "loops": loops }))
            }
            "loop.status" => {
                let status = lock_loops()?.status();
                Ok(json!(status))
            }
            "loop.process" => {
                lock_loops()?.process()?;
                Ok(json!({ "success": true }))
            }
            "loop.prune" => {
                lock_loops()?.prune()?;
                Ok(json!({ "success": true }))
            }
            "loop.retry" => {
                let params: LoopRetryParams = self.parse_params(request)?;
                lock_loops()?.retry(params)?;
                Ok(json!({ "success": true }))
            }
            "loop.discard" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                lock_loops()?.discard(&params.id)?;
                Ok(json!({ "success": true }))
            }
            "loop.stop" => {
                let params: LoopStopMergeParams = self.parse_params(request)?;
                lock_loops()?.stop(params)?;
                Ok(json!({ "success": true }))
            }
            "loop.merge" => {
                let params: LoopStopMergeParams = self.parse_params(request)?;
                lock_loops()?.merge(params)?;
                Ok(json!({ "success": true }))
            }
            "loop.merge_button_state" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                let state = lock_loops()?.merge_button_state(&params.id)?;
                Ok(json!(state))
            }
            "loop.trigger_merge_task" => {
                let params: LoopTriggerMergeTaskParams = self.parse_params(request)?;
                let loops = lock_loops()?;
                let mut tasks = domains
                    .tasks
                    .lock()
                    .map_err(|_| ApiError::internal("task domain lock poisoned"))?;
                let result = loops.trigger_merge_task(params, &mut tasks)?;
                Ok(json!(result))
            }
            "loop.diff" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                let result = lock_loops()?.diff(LoopDiffParams { id: params.id })?;
                Ok(json!(result))
            }
            _ => Err(ApiError::service_unavailable(format!(
                "method '{}' is recognized but not implemented",
                request.method
            ))),
        }
    }

    fn dispatch_planning(&self, request: &RpcRequestEnvelope) -> Result<Value, ApiError> {
        let domains = self.resolve_project_domains(extract_project_id(request).as_deref())?;
        let lock_planning = || {
            domains
                .planning
                .lock()
                .map_err(|_| ApiError::internal("planning domain lock poisoned"))
        };
        match request.method.as_str() {
            "planning.list" => {
                let sessions = lock_planning()?.list()?;
                Ok(json!({ "sessions": sessions }))
            }
            "planning.get" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                let session = lock_planning()?.get(&params.id)?;
                Ok(json!({ "session": session }))
            }
            "planning.start" => {
                let params: PlanningStartParams = self.parse_params(request)?;
                let session = lock_planning()?.start(params)?;
                Ok(json!({ "session": session }))
            }
            "planning.respond" => {
                let params: PlanningRespondParams = self.parse_params(request)?;
                lock_planning()?.respond(params)?;
                Ok(json!({ "success": true }))
            }
            "planning.resume" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                lock_planning()?.resume(&params.id)?;
                Ok(json!({ "success": true }))
            }
            "planning.delete" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                lock_planning()?.delete(&params.id)?;
                Ok(json!({ "success": true }))
            }
            "planning.get_artifact" => {
                let params: PlanningGetArtifactParams = self.parse_params(request)?;
                let artifact = lock_planning()?.get_artifact(params)?;
                Ok(json!(artifact))
            }
            _ => Err(ApiError::service_unavailable(format!(
                "method '{}' is recognized but not implemented",
                request.method
            ))),
        }
    }

    fn dispatch_config(&self, request: &RpcRequestEnvelope) -> Result<Value, ApiError> {
        let domains = self.resolve_project_domains(extract_project_id(request).as_deref())?;
        match request.method.as_str() {
            "config.get" => {
                let config = domains.config.get()?;
                Ok(json!(config))
            }
            "config.update" => {
                let params: ConfigUpdateParams = self.parse_params(request)?;
                let result = domains.config.update(params)?;
                Ok(json!(result))
            }
            _ => Err(ApiError::service_unavailable(format!(
                "method '{}' is recognized but not implemented",
                request.method
            ))),
        }
    }

    fn dispatch_preset(&self, request: &RpcRequestEnvelope) -> Result<Value, ApiError> {
        let domains = self.resolve_project_domains(extract_project_id(request).as_deref())?;
        let lock_collections = || {
            domains
                .collections
                .lock()
                .map_err(|_| ApiError::internal("collection domain lock poisoned"))
        };
        match request.method.as_str() {
            "preset.list" => {
                let collections = lock_collections()?.list();
                let presets = domains.preset.list(&collections);
                Ok(json!({ "presets": presets }))
            }
            "preset.get" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                if params.id.starts_with("collection:") {
                    let collection_id = params.id.strip_prefix("collection:").unwrap();
                    let yaml = lock_collections()?.export(collection_id)?;
                    Ok(json!({ "yaml": yaml }))
                } else {
                    let yaml = domains.preset.get(&params.id)?;
                    Ok(json!({ "yaml": yaml }))
                }
            }
            _ => Err(ApiError::service_unavailable(format!(
                "method '{}' is recognized but not implemented",
                request.method
            ))),
        }
    }

    fn dispatch_collection(&self, request: &RpcRequestEnvelope) -> Result<Value, ApiError> {
        let domains = self.resolve_project_domains(extract_project_id(request).as_deref())?;
        let lock_collections = || {
            domains
                .collections
                .lock()
                .map_err(|_| ApiError::internal("collection domain lock poisoned"))
        };
        match request.method.as_str() {
            "collection.list" => {
                let collections = lock_collections()?.list();
                Ok(json!({ "collections": collections }))
            }
            "collection.get" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                let collection = lock_collections()?.get(&params.id)?;
                Ok(json!({ "collection": collection }))
            }
            "collection.create" => {
                let params: CollectionCreateParams = self.parse_params(request)?;
                let collection = lock_collections()?.create(params)?;
                Ok(json!({ "collection": collection }))
            }
            "collection.update" => {
                let params: CollectionUpdateParams = self.parse_params(request)?;
                let collection = lock_collections()?.update(params)?;
                Ok(json!({ "collection": collection }))
            }
            "collection.delete" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                lock_collections()?.delete(&params.id)?;
                Ok(json!({ "success": true }))
            }
            "collection.import" => {
                let params: CollectionImportParams = self.parse_params(request)?;
                let collection = lock_collections()?.import(params)?;
                Ok(json!({ "collection": collection }))
            }
            "collection.export" => {
                let params: IdOnlyParams = self.parse_params(request)?;
                let yaml = lock_collections()?.export(&params.id)?;
                Ok(json!({ "yaml": yaml }))
            }
            _ => Err(ApiError::service_unavailable(format!(
                "method '{}' is recognized but not implemented",
                request.method
            ))),
        }
    }

    fn dispatch_project(&self, request: &RpcRequestEnvelope) -> Result<Value, ApiError> {
        match request.method.as_str() {
            "project.list" => {
                let registered = self.project_registry_mut()?.list();
                let ws = &self.config.workspace_root;
                let default_name = ws
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "default".into());
                let mut projects = vec![json!({
                    "id": "default",
                    "name": default_name,
                    "path": ws.to_string_lossy(),
                    "isDefault": true,
                })];
                for p in registered {
                    projects.push(serde_json::to_value(p).unwrap_or_default());
                }
                Ok(json!({ "projects": projects }))
            }
            "project.add" => {
                let params: ProjectAddParams = self.parse_params(request)?;
                let project = self.project_registry_mut()?.add(params)?;
                Ok(json!({ "project": project }))
            }
            "project.remove" => {
                let params: ProjectRemoveParams = self.parse_params(request)?;
                self.project_registry_mut()?.remove(params)?;
                Ok(json!({ "success": true }))
            }
            "project.browse" => {
                let params: ProjectBrowseParams = self.parse_params(request)?;
                let entries = self.project_registry_mut()?.browse(params)?;
                Ok(json!({ "entries": entries }))
            }
            _ => Err(ApiError::service_unavailable(format!(
                "method '{}' is recognized but not implemented",
                request.method
            ))),
        }
    }

    fn dispatch_stream(
        &self,
        request: &RpcRequestEnvelope,
        principal: &str,
    ) -> Result<Value, ApiError> {
        match request.method.as_str() {
            "stream.subscribe" => {
                let params: StreamSubscribeParams = self.parse_params(request)?;
                let result = self.stream_domain().subscribe(params, principal)?;
                Ok(json!(result))
            }
            "stream.unsubscribe" => {
                let params: StreamUnsubscribeParams = self.parse_params(request)?;
                self.stream_domain().unsubscribe(params)?;
                Ok(json!({ "success": true }))
            }
            "stream.ack" => {
                let params: StreamAckParams = self.parse_params(request)?;
                self.stream_domain().ack(params)?;
                Ok(json!({ "success": true }))
            }
            _ => Err(ApiError::service_unavailable(format!(
                "method '{}' is recognized but not implemented",
                request.method
            ))),
        }
    }
}

use serde::Deserialize as InternalDeserialize;

#[derive(Debug, Clone, InternalDeserialize)]
#[serde(rename_all = "camelCase")]
struct InternalPublishParams {
    topic: String,
    resource_type: String,
    resource_id: String,
    payload: Value,
}

impl RpcRuntime {
    /// Internal-only method for the orchestration loop to inject events
    /// into the stream domain. Not part of the public RPC contract.
    fn dispatch_internal_publish(&self, request: &RpcRequestEnvelope) -> Result<Value, ApiError> {
        let params: InternalPublishParams = self.parse_params(request)?;
        self.stream_domain().publish(
            &params.topic,
            &params.resource_type,
            &params.resource_id,
            params.payload,
        );
        Ok(json!({ "success": true }))
    }
}

fn parse_task_update_input(request: &RpcRequestEnvelope) -> Result<TaskUpdateInput, ApiError> {
    let object = request.params.as_object().ok_or_else(|| {
        ApiError::invalid_params("task.update params must be an object")
            .with_details(json!({ "method": request.method }))
    })?;

    let id = object
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| ApiError::invalid_params("task.update requires non-empty 'id'"))?
        .to_string();

    let title = object
        .get("title")
        .and_then(Value::as_str)
        .map(std::string::ToString::to_string);

    let status = object
        .get("status")
        .and_then(Value::as_str)
        .map(std::string::ToString::to_string);

    let priority = object
        .get("priority")
        .and_then(Value::as_u64)
        .and_then(|value| u8::try_from(value).ok());

    let blocked_by = if object.contains_key("blockedBy") {
        let value = object
            .get("blockedBy")
            .expect("contains_key check guarantees blockedBy exists");
        if value.is_null() {
            Some(None)
        } else {
            let blocked_by = value.as_str().ok_or_else(|| {
                ApiError::invalid_params("task.update blockedBy must be a string or null")
            })?;
            Some(Some(blocked_by.to_string()))
        }
    } else {
        None
    };

    Ok(TaskUpdateInput {
        id,
        title,
        status,
        priority,
        blocked_by,
    })
}
