# Spec: Web Dashboard — Full Loop Observability & Management

## Goal

Bring the web dashboard to feature parity with the TUI and CLI for loop
observability and management. A user should be able to create, run, monitor,
and control loops entirely from the browser without touching the terminal.

## Background

Today the web dashboard can create tasks and see their status, but has critical
gaps that force users back to the CLI:

- No live agent output (the TUI's primary feature)
- No event history
- No loop diff view
- Tasks stuck at "pending" when primary lock is held (no worktree spawning)
- No cancel button for pending/running tasks
- No way to see which hat is active or what iteration the loop is on

The API already has WebSocket streaming (`stream.subscribe`) and the RPC
methods for most operations. The gaps are primarily in the frontend.

## Features

### 1. Live Loop Output Panel

**What:** A real-time streaming panel showing agent output as it happens,
identical to what the TUI shows.

**How:**
- Use the existing `stream.subscribe` WebSocket API with topic
  `task.log.line` to receive live output
- Render in a scrollable, auto-following terminal-style panel
- Show on the task detail page when a task is running
- Support ANSI color codes for syntax-highlighted output
- Pause/resume auto-scroll toggle

**Acceptance criteria:**
- Given a running task, when I open its detail page, then I see live agent
  output streaming in real-time
- Given the output panel, when new lines arrive, then it auto-scrolls to
  bottom unless I've scrolled up
- Given the output panel, when the task completes, then the stream closes
  and final status is shown

### 2. Iteration & Hat Status Bar

**What:** A status bar showing current iteration number, active hat name,
elapsed time, and progress toward max_iterations.

**How:**
- Subscribe to `task.status.changed` stream events
- Parse iteration count, hat name, and timing from events
- Render as a compact bar above the log output
- Show progress bar for iterations (current / max)

**Acceptance criteria:**
- Given a running task, when a new iteration starts, then the status bar
  updates with iteration number and active hat name
- Given a running task, then I can see elapsed time and iteration progress

### 3. Event History Timeline

**What:** A timeline view of all events emitted during a loop — which hats
fired, what events were published, backpressure gate results.

**How:**
- New component `EventTimeline` on the task detail page
- Fetch events from `loop.list` or a new `task.events` endpoint
- Render as a vertical timeline with event type, hat name, timestamp,
  and payload preview
- Color-code by event type (hat activation, backpressure pass/fail,
  completion)

**Acceptance criteria:**
- Given a completed or running task, when I view its detail page, then I
  see a timeline of all events
- Given the timeline, when I click an event, then I see its full payload
- Given a backpressure failure event, then it's highlighted in red with
  the gate name and error

### 4. Loop Diff View

**What:** Show what files changed in a loop, with a diff viewer.

**How:**
- Call `loop.list` to get loop info, then use a new `loop.diff` RPC method
  that returns the git diff from merge-base
- Render with a code diff component (use a lightweight diff viewer library
  or pre-formatted HTML from the API)
- Show on task detail page as a "Changes" tab

**Acceptance criteria:**
- Given a completed loop, when I click "Changes" tab, then I see all
  modified files with diffs
- Given the diff view, when I click a filename, then it expands to show
  the full diff for that file

### 5. Worktree-Aware Task Runner

**What:** When a task is run from the UI and the primary lock is held,
automatically spawn into a worktree instead of hanging at "pending".

**How:**
- Modify the API task runner to detect lock state
- If lock is held, spawn `ralph run` with worktree support (same logic
  as CLI)
- Update task status to "running" immediately with worktree location
- Stream logs from the worktree loop

**Acceptance criteria:**
- Given the primary lock is held, when I run a task from the UI, then it
  spawns into a worktree and starts running
- Given a worktree task, then its status shows "running" with the worktree
  path
- Given a worktree task completes, then it queues for merge and status
  updates accordingly

### 6. Task Action Buttons

**What:** Cancel, Stop, Retry, and Delete buttons available based on task
status.

**How:**
- Add action buttons to task list items and task detail page
- Map status to available actions:
  - pending → Cancel
  - running → Stop (SIGTERM), Force Stop (SIGKILL)
  - failed → Retry, Delete
  - completed → Delete, Archive
  - open → Run, Delete

**Acceptance criteria:**
- Given a pending task, when I click Cancel, then it's marked as
  cancelled/failed
- Given a running task, when I click Stop, then the loop is terminated
  gracefully
- Given a failed task, when I click Retry, then a new loop is spawned

### 7. Loop Management Panel

**What:** A dedicated section (or tab on Tasks page) showing all loops
across all tasks — primary, worktree, merged, needs-review.

**How:**
- Use existing `loop.list` RPC method
- Show loop ID, status, location (in-place vs worktree path), prompt
  preview, started time, duration
- Action buttons: Stop, Discard, Retry Merge, Attach (opens terminal
  instructions)
- Auto-refresh on interval or via WebSocket

**Acceptance criteria:**
- Given multiple loops running, then I see all of them with their status
- Given a loop in "needs-review" state, then I see a "Retry Merge" button
- Given a loop list, then it auto-refreshes to show status changes

## Implementation Order

### Phase 1: Critical (unblocks basic usage)
1. Task action buttons (cancel, stop, retry)
2. Worktree-aware task runner
3. Live loop output panel

### Phase 2: Observability
4. Iteration & hat status bar
5. Event history timeline
6. Loop management panel

### Phase 3: Advanced
7. Loop diff view

## Technical Notes

### Existing API support
- `stream.subscribe` with WebSocket — already implemented for real-time events
- `task.cancel`, `task.run`, `task.retry` — already exist
- `loop.list`, `loop.stop`, `loop.discard`, `loop.retry`, `loop.merge` — exist
- `loop.merge_button_state` — exists

### New API endpoints needed
- `loop.diff` — returns git diff for a loop (stat + full diff)
- `task.events` — returns event history for a task's loop (or reuse
  existing event file reading)

### Frontend libraries to consider
- Terminal output: `xterm.js` or simple pre-formatted div with ANSI parsing
- Diff viewer: `react-diff-viewer` or server-rendered HTML diff
- Timeline: custom component with existing UI primitives

### Stream topics to use
- `task.log.line` — live agent output
- `task.status.changed` — status transitions
- `loop.status.changed` — loop lifecycle events
- `loop.merge.progress` — merge status updates
