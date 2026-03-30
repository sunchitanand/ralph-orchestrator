# Ralph Orchestrator — Session Handoff Context

## Repo

Fork: https://github.com/sunchitanand/ralph-orchestrator
Clone and work from: ~/Documents/code/playground/ralph-orchestrator

## What Ralph Is

Hat-based orchestration framework running AI agents in a loop until done. Agent gets fresh context each iteration, does work, emits event via `ralph emit`, Ralph routes to next hat.

- **Hats** = agent personas (instructions + triggers + publishes)
- **Events** = routing between hats (JSONL file via `ralph emit`)
- **Backpressure** = tests/lint/build gates each iteration
- **Memories** = persistent learnings (`.ralph/agent/memories.md`)
- **Tasks** = runtime work queue (`.ralph/agent/tasks.jsonl`)
- **Worktrees** = parallel loops in isolated git worktrees

## What We Built

- Source root fix — `RALPH_SOURCE_ROOT` env var for `ralph web`
- Workspace indicator in sidebar
- Backend pi → kiro
- TaskDetailHeader pending status crash fix
- Presets browser page with YAML detail view + Open in Builder
- preset.get API endpoint
- Builder viewport persistence (sessionStorage)
- Frontend ralph config (ralph.frontend.yml)

### Worktree Loops (completed, need merging)

- **fair-fox** — Dashboard observability (live output, action buttons, event timeline)
- **zesty-jay** — Multi-project dashboard (project.list/add/remove/browse API)

Merge with: `ralph loops merge fair-fox` / `ralph loops merge zesty-jay`

### Specs in .ralph/specs/

- presets-browser.md (done)
- dashboard-observability.md
- multi-project-dashboard.md

## Next Task: AIM SOP → Ralph Hat Collection POC

### AIM → Ralph Mapping

- Agent SOP → Hat instructions field
- SOP Steps → Multiple hats wired with events
- Skills → Skills (ralph has .claude/skills/)
- Context files → Guardrails + memories
- Agent spec → Hat collection YAML
- MCP servers → Same

### How to Build

1. Pick an AIM SOP from oncall agent package
2. Open Builder page in ralph web dashboard
3. One hat per SOP step, paste instructions
4. Wire events between hats
5. Add failure paths
6. Export YAML
7. Run: `ralph run -H exported.yml -p "Execute the SOP"`

### How Events Work

Agent gets prompt saying "publish ONE of: step1.done, step1.failed"
Agent runs `ralph emit "step1.done" "summary"` as shell command
Writes to .ralph/events.jsonl → Ralph reads → matches next hat → new iteration

## How to Run

```bash
cargo build && cargo test
ralph web                    # dashboard for this repo
ralph web --workspace ~/path # dashboard for another project
ralph run -c ralph.frontend.yml -H builtin:code-assist -p "prompt"
ralph loops                  # monitor
```

## Known Gaps

- UI task runner can't spawn worktree loops
- No live output streaming in web dashboard
- No event history view in dashboard
- No cancel button for pending tasks
- code-assist Critic hat tries Playwright — needs guardrails
