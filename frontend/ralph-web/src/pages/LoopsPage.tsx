/**
 * LoopsPage Component
 *
 * Dedicated page showing all orchestration loops with status, actions,
 * auto-refresh polling, and active/all filter toggle.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoopBadge, LoopActions, EmptyState, WorktreeBadge } from "@/components/tasks";
import type { LoopDetailData, LoopActionCallbacks } from "@/components/tasks";
import { Repeat, Clock } from "lucide-react";

function shortId(id: string): string {
  return id.slice(0, 12);
}

function truncatePrompt(prompt: string, max = 80): string {
  if (prompt.length <= max) return prompt;
  return prompt.slice(0, max) + "…";
}

function formatAge(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function LoopsPage() {
  const [showAll, setShowAll] = useState(false);
  const utils = trpc.useUtils();

  const loopsQuery = trpc.loops.list.useQuery(
    { includeTerminal: showAll },
    { refetchInterval: 5000 }
  );

  const managerQuery = trpc.loops.managerStatus.useQuery(undefined, {
    refetchInterval: 10000,
  });

  const stopMutation = trpc.loops.stop.useMutation({
    onSuccess: () => utils.loops.list.invalidate(),
  });
  const discardMutation = trpc.loops.discard.useMutation({
    onSuccess: () => utils.loops.list.invalidate(),
  });
  const retryMutation = trpc.loops.retry.useMutation({
    onSuccess: () => utils.loops.list.invalidate(),
  });
  const mergeMutation = trpc.loops.merge.useMutation({
    onSuccess: () => utils.loops.list.invalidate(),
  });

  const callbacks: LoopActionCallbacks = useMemo(
    () => ({
      onStop: async (id: string) => {
        await stopMutation.mutateAsync({ id });
      },
      onDiscard: async (id: string) => {
        await discardMutation.mutateAsync({ id });
      },
      onRetry: async (id: string) => {
        await retryMutation.mutateAsync({ id });
      },
      onMerge: async (id: string, force?: boolean) => {
        await mergeMutation.mutateAsync({ id, force });
      },
    }),
    [stopMutation, discardMutation, retryMutation, mergeMutation]
  );

  const loops = (loopsQuery.data ?? []) as LoopDetailData[];

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Loops</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor and manage orchestration loops
          </p>
        </div>
        <div className="flex items-center gap-3">
          {managerQuery.data && (
            <span
              className={`text-xs px-2 py-1 rounded ${
                managerQuery.data.running
                  ? "bg-green-500/10 text-green-400"
                  : "bg-yellow-500/10 text-yellow-400"
              }`}
            >
              Manager: {managerQuery.data.running ? "running" : "stopped"}
            </span>
          )}
          <div className="flex rounded-md border border-border">
            <Button
              variant={!showAll ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowAll(false)}
            >
              Active
            </Button>
            <Button
              variant={showAll ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowAll(true)}
            >
              All
            </Button>
          </div>
        </div>
      </header>

      {loopsQuery.isLoading && (
        <p className="text-muted-foreground">Loading loops...</p>
      )}

      {!loopsQuery.isLoading && loops.length === 0 && (
        <EmptyState
          icon={Repeat}
          title="No loops"
          description={
            showAll
              ? "No loops have been created yet."
              : "No active loops running. Start one with ralph run."
          }
        />
      )}

      {loops.length > 0 && (
        <div className="space-y-3">
          {loops.map((loop) => (
            <Card key={loop.id}>
              <CardContent className="flex items-center gap-4 py-3 px-4">
                <LoopBadge status={loop.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-muted-foreground">
                      {shortId(loop.id)}
                    </span>
                    {loop.location !== "(in-place)" && loop.id && (
                      <WorktreeBadge loopId={loop.id} />
                    )}
                  </div>
                  <p className="text-sm truncate mt-0.5">
                    {truncatePrompt(loop.prompt)}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{loop.location}</span>
                    {loop.startedAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatAge(loop.startedAt)}
                      </span>
                    )}
                  </div>
                </div>
                <LoopActions
                  id={loop.id}
                  status={loop.status}
                  callbacks={callbacks}
                  mergeButtonState={loop.mergeButtonState}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
