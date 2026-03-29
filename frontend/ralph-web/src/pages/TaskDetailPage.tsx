/**
 * TaskDetailPage Component
 *
 * Dedicated page for viewing task details with improved UX.
 * Per spec: .sop/task-ux-improvements/design/detailed-design.md
 *
 * Layout:
 * - TaskDetailHeader: Back navigation + action buttons
 * - Title: Full prompt display
 * - TaskStatusBar: Status, iteration, loop, preset badges
 * - TaskMetadataGrid: Two-column timing and execution details
 * - ExecutionSummary: Collapsible execution results
 * - User steering UI (for needs-review loops)
 * - EnhancedLogViewer: Real-time log streaming
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { trpc } from "@/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  EnhancedLogViewer,
  TaskCardSkeleton,
  EmptyState,
  TaskDetailHeader,
  TaskMetadataGrid,
  LoopBadge,
  WorktreeBadge,
  IterationStatusBar,
  EventTimeline,
  DiffViewer,
  type LoopDetailData,
} from "@/components/tasks";
import { useTaskWebSocket } from "@/hooks/useTaskWebSocket";
import {
  AlertTriangle,
  Loader2,
  GitMerge,
  AlertCircle,
  FileQuestion,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { TaskAction } from "@/components/tasks/TaskDetailHeader";

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Fetch task data
  const {
    data: task,
    isLoading,
    isError,
    error,
  } = trpc.task.get.useQuery({ id: id! }, { enabled: !!id });

  // Fetch loops for loopId-based mapping to associate task with loop
  const loopsQuery = trpc.loops.list.useQuery(
    { includeTerminal: true },
    { refetchInterval: 5000 }
  );

  // Find the associated loop by loopId
  // Guard: if task is terminal (failed/closed) but the loop slot shows "running",
  // the loop was reused for a different run — don't show a stale association.
  const associatedLoop = useMemo(() => {
    if (!loopsQuery.data || !task?.loopId) return undefined;
    const loops = loopsQuery.data as LoopDetailData[];
    const loop = loops.find((l) => l.id === task.loopId);
    if (!loop) return undefined;
    const isTaskTerminal = task.status === "failed" || task.status === "closed";
    if (isTaskTerminal && loop.status === "running") return undefined;
    return loop;
  }, [loopsQuery.data, task?.loopId, task?.status]);

  // User steering state for needs-review loops
  const [steeringInput, setSteeringInput] = useState("");
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"output" | "events" | "changes">("output");

  // Iteration/hat tracking from WebSocket events
  const { currentIteration, currentHat, events } = useTaskWebSocket(id ?? null);

  // Fetch config for max_iterations
  const configQuery = trpc.config.get.useQuery();

  // Derive max_iterations from config
  const maxIterations = useMemo(() => {
    const parsed = configQuery.data?.parsed;
    const el = parsed?.event_loop as Record<string, unknown> | undefined;
    const val = el?.max_iterations;
    return typeof val === "number" ? val : null;
  }, [configQuery.data?.parsed]);

  // Fetch loop diff when Changes tab is active
  const diffQuery = trpc.loops.diff.useQuery(
    { id: associatedLoop?.id ?? "" },
    { enabled: !!associatedLoop && activeTab === "changes" }
  );

  // Mutations
  const utils = trpc.useUtils();
  const runMutation = trpc.task.run.useMutation();
  const retryMutation = trpc.task.retry.useMutation();
  const cancelMutation = trpc.task.cancel.useMutation();
  const loopStopMutation = trpc.loops.stop.useMutation({
    onSuccess: () => {
      utils.loops.list.invalidate();
    },
  });
  const deleteMutation = trpc.task.delete.useMutation({
    onSuccess: () => {
      navigate("/tasks");
    },
  });
  const retryMergeMutation = trpc.loops.retry.useMutation({
    onSuccess: () => {
      utils.loops.list.invalidate();
      setSteeringInput("");
    },
  });

  // Handle actions from TaskDetailHeader
  const handleAction = useCallback(
    (action: TaskAction) => {
      if (!task) return;
      switch (action) {
        case "run":
          runMutation.mutate({ id: task.id });
          break;
        case "retry":
          retryMutation.mutate({ id: task.id });
          break;
        case "stop":
          if (window.confirm(`Stop running task "${task.title}"?`)) {
            cancelMutation.mutate({ id: task.id });
            if (associatedLoop) {
              loopStopMutation.mutate({ id: associatedLoop.id });
            }
          }
          break;
        case "forceStop":
          if (window.confirm(`Force stop task "${task.title}"? This will immediately kill the process.`)) {
            cancelMutation.mutate({ id: task.id, force: true });
            if (associatedLoop) {
              loopStopMutation.mutate({ id: associatedLoop.id, force: true });
            }
          }
          break;
      }
    },
    [task, runMutation, retryMutation, cancelMutation, associatedLoop, loopStopMutation]
  );

  // Handle retry merge with user steering input
  const handleRetryMerge = useCallback(() => {
    if (!associatedLoop) return;
    retryMergeMutation.mutate({
      id: associatedLoop.id,
      steeringInput: steeringInput.trim() || undefined,
    });
  }, [associatedLoop, retryMergeMutation, steeringInput]);

  // Handle task deletion with confirmation
  const handleDelete = useCallback(() => {
    if (!task) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete this task?\n\n"${task.title}"\n\nThis action cannot be undone.`
    );
    if (confirmed) {
      deleteMutation.mutate({ id: task.id });
    }
  }, [task, deleteMutation]);

  // Keyboard navigation - Escape to go back
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        navigate("/tasks");
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  // Loading state with skeletons
  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <TaskCardSkeleton />
        <TaskCardSkeleton />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          icon={AlertCircle}
          title="Error"
          description={error?.message || "Task not found"}
        />
      </div>
    );
  }

  // Not found state
  if (!task) {
    return (
      <div className="p-6">
        <EmptyState
          icon={FileQuestion}
          title="Task not found"
          description="The requested task could not be found."
        />
      </div>
    );
  }

  // Allow deletion only for terminal states (failed or closed)
  const showDeleteButton = task.status === "failed" || task.status === "closed";

  // Determine if log viewer should be shown (for running or completed tasks)
  const showLogViewer =
    task.status === "running" ||
    task.status === "completed" ||
    task.status === "closed" ||
    task.status === "failed";

  // Check if any action is pending
  const isActionPending =
    runMutation.isPending ||
    retryMutation.isPending ||
    cancelMutation.isPending ||
    loopStopMutation.isPending;

  // Map task status for components
  const taskStatus = task.status as
    | "open"
    | "running"
    | "completed"
    | "closed"
    | "failed";

  return (
    <div className="p-6 space-y-6">
      {/* Header with back navigation and action buttons */}
      <TaskDetailHeader
        status={taskStatus}
        onBack={() => navigate("/tasks")}
        onAction={handleAction}
        isActionPending={isActionPending}
        showDelete={showDeleteButton}
        onDelete={handleDelete}
        isDeletePending={deleteMutation.isPending}
      />

      {/* Page title - full prompt display with markdown rendering */}
      <div className="markdown-prose">
        <ReactMarkdown>{task.title}</ReactMarkdown>
      </div>

      {/* Loop badge (if associated with a loop) */}
      {associatedLoop && (
        <div className="flex items-center gap-2 flex-wrap">
          <LoopBadge
            status={associatedLoop.status}
            onClick={() => navigate(`/loops/${associatedLoop.id}`)}
            showPrefix={true}
          />
          {associatedLoop.location !== "(in-place)" && (
            <WorktreeBadge loopId={associatedLoop.id} />
          )}
        </div>
      )}

      {/* Metadata grid - two column layout */}
      <TaskMetadataGrid
        task={task}
        worktreePath={associatedLoop && associatedLoop.location !== "(in-place)" ? associatedLoop.location : undefined}
      />

      {/* User steering UI for needs-review loops */}
      {associatedLoop?.status === "needs-review" && (
        <div
          className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-4 space-y-4"
          data-testid="user-steering-callout"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-700 dark:text-amber-400">
                Merge Needs Your Input
              </h3>
              {associatedLoop.failureReason && (
                <p className="text-sm text-muted-foreground mt-1">
                  {associatedLoop.failureReason}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium" htmlFor="steering-input">
              Provide clarification or guidance for the merge
            </label>
            <Textarea
              id="steering-input"
              value={steeringInput}
              onChange={(e) => setSteeringInput(e.target.value)}
              placeholder="e.g., 'Keep my changes, discard incoming' or 'Prefer the newer API version'"
              className="min-h-[80px] resize-none"
              disabled={retryMergeMutation.isPending}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Your input will guide the next merge attempt
              </span>
              <Button
                onClick={handleRetryMerge}
                disabled={retryMergeMutation.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {retryMergeMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <GitMerge className="h-4 w-4 mr-2" />
                    Retry Merge
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Iteration status bar (only for running tasks) */}
      {task.status === "running" && currentIteration !== null && (
        <IterationStatusBar
          iteration={currentIteration}
          maxIterations={maxIterations}
          hatName={currentHat}
          startedAt={task.startedAt ?? null}
        />
      )}

      {/* Tabbed content area (when task has a loop) or plain log viewer */}
      {associatedLoop && showLogViewer ? (
        <div>
          <div role="tablist" className="flex border-b border-border mb-4">
            {(["output", "events", "changes"] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === "output" && (
            <div data-testid="log-viewer">
              <EnhancedLogViewer taskId={task.id} />
            </div>
          )}

          {activeTab === "events" && (
            <div>
              {events.length > 0 ? (
                <EventTimeline events={events} />
              ) : (
                <p className="text-sm text-muted-foreground py-4">No events yet</p>
              )}
            </div>
          )}

          {activeTab === "changes" && (
            <div>
              {diffQuery.isLoading ? (
                <p className="text-sm text-muted-foreground py-4">Loading diff…</p>
              ) : (
                <DiffViewer files={diffQuery.data?.files ?? []} />
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Event Timeline (for running and completed tasks with events, no loop) */}
          {events.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setTimelineOpen((v) => !v)}
                className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {timelineOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Event Timeline ({events.length} events)
              </button>
              {timelineOpen && <EventTimeline events={events} />}
            </div>
          )}

          {/* Log viewer (for running/completed/failed tasks) */}
          {showLogViewer && (
            <div data-testid="log-viewer">
              <EnhancedLogViewer taskId={task.id} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
