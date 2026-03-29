# Spec: Multi-Project Dashboard

## Goal

Allow the web dashboard to manage multiple project directories from a single
UI instance. Users can add projects (local folders or remote via SSH port
forwarding), see all their loops/tasks grouped by project, and create tasks
under any project — all from the sidebar.

## Background

Today `ralph-api` is scoped to a single `workspace_root`. All domain objects
(`TaskDomain`, `LoopDomain`, `ConfigDomain`, etc.) are instantiated once with
that path. The UI has no concept of projects — everything is flat.

The domain objects already accept a workspace path in their constructors, so
supporting multiple workspaces is mostly about managing N sets of domains and
routing requests to the right one.

## Design

### Project Registry

A JSON file at `~/.ralph/projects.json` stores the list of known projects:

```json
{
  "projects": [
    { "id": "abc123", "name": "shortsy", "path": "/Users/sunchit/Documents/projects/shortsy" },
    { "id": "def456", "name": "ralph-orchestrator", "path": "/Users/sunchit/Documents/code/playground/ralph-orchestrator" }
  ]
}
```

The API manages this file. Projects can be added/removed via RPC calls.

### API Changes

#### New RPC methods

- `project.list` — returns all registered projects with basic status (has
  ralph.yml, number of active loops)
- `project.add` — registers a new project directory (validates path exists and
  is a directory)
- `project.remove` — unregisters a project (does not delete files)
- `project.browse` — lists directories at a given path (for the folder picker
  UI). Returns entries with name, path, isDirectory, hasRalphYml

#### Scoped existing methods

All existing RPC methods (`task.*`, `loop.*`, `config.*`, `preset.*`,
`collection.*`) gain an optional `projectId` parameter. If omitted, falls back
to the default workspace root (backwards compatible).

#### Implementation approach

`RpcRuntime` holds a `ProjectRegistry` that maps project IDs to per-project
domain instances. On first access for a project, domains are lazily
instantiated. The existing single-workspace behavior is preserved as the
"default" project.

```
RpcRuntime
├── default_workspace (existing behavior)
├── project_registry: HashMap<String, ProjectDomains>
│   ├── "abc123" → { tasks, loops, config, presets, collections, planning }
│   └── "def456" → { tasks, loops, config, presets, collections, planning }
```

### Frontend Changes

#### Sidebar redesign

The sidebar gets a project section above the nav items:

```
┌─────────────────────┐
│ 🎩 RO        Alpha  │
│─────────────────────│
│ + Add Project       │
│                     │
│ ▼ shortsy           │
│   ● 2 tasks running │
│   ○ 1 loop queued   │
│                     │
│ ▶ ralph-orchestrator│
│                     │
│─────────────────────│
│ 📋 Tasks            │
│ 🔧 Builder          │
│ 📚 Presets           │
│ ⚙️ Settings          │
│─────────────────────│
│ ◀ Collapse          │
└─────────────────────┘
```

- Clicking a project selects it — all pages (Tasks, Settings, etc.) scope to
  that project
- Collapsed project shows name + status badge (running count)
- Expanded project shows task/loop summary
- "+ Add Project" opens a folder picker dialog

#### Folder picker dialog

A modal with:
- Text input for path (paste or type)
- Browse button that calls `project.browse` to navigate directories
- Shows directory listing, click to navigate deeper
- Directories with `ralph.yml` get a badge
- "Add" button registers the project

#### Active project context

A Zustand store holds `activeProjectId`. All RPC calls include this as
`projectId` parameter. Pages don't need to change much — they just pass the
active project ID through.

## Acceptance Criteria

1. `project.list`, `project.add`, `project.remove`, `project.browse` RPC
   methods work
2. Existing `task.*`, `loop.*`, `config.*` methods accept optional `projectId`
   and scope correctly
3. Sidebar shows registered projects with active loop/task counts
4. Clicking a project switches context — Tasks page shows that project's tasks
5. "Add Project" dialog lets user browse and select a local directory
6. Removing a project from the sidebar unregisters it (no file deletion)
7. Default workspace (the one API was started with) appears as a project
   automatically
8. Backwards compatible — omitting `projectId` uses default workspace

## Out of Scope (for now)

- SSH/remote filesystem browsing (future: `project.browse` could accept a
  `host` parameter and shell out to `ssh ls`)
- Per-project hat collection management from the UI
- Cross-project task dependencies
- Running `ralph run` from the UI (existing task.run covers this)

## Implementation Order

### Phase 1: API (backend)
1. `ProjectRegistry` struct + `~/.ralph/projects.json` persistence
2. `project.list`, `project.add`, `project.remove`, `project.browse` handlers
3. Refactor `RpcRuntime` to hold per-project domain instances
4. Add optional `projectId` routing to existing dispatch methods

### Phase 2: Frontend
5. `activeProjectId` Zustand store
6. Sidebar project list component with add/remove
7. Folder picker dialog
8. Wire `projectId` into all `trpc.*` calls
9. Project-scoped pages (Tasks, Settings show active project's data)

## Files to Create/Modify

### New files
- `crates/ralph-api/src/project_domain.rs` — registry, browse, CRUD
- `frontend/ralph-web/src/components/layout/ProjectList.tsx` — sidebar section
- `frontend/ralph-web/src/components/layout/FolderPicker.tsx` — add project dialog

### Modified files
- `crates/ralph-api/src/runtime.rs` — hold ProjectRegistry, route by projectId
- `crates/ralph-api/src/protocol.rs` — add project.* to KNOWN_METHODS
- `crates/ralph-api/src/runtime/dispatch.rs` — add project.* dispatch
- `crates/ralph-api/src/config.rs` — projects config path
- `frontend/ralph-web/src/store.ts` — activeProjectId state
- `frontend/ralph-web/src/trpc.ts` — pass projectId in all calls
- `frontend/ralph-web/src/components/layout/Sidebar.tsx` — project list
- `frontend/ralph-web/src/rpc/client.ts` — inject projectId middleware
