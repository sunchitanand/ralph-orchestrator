import { useState } from "react";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import type { RalphEvent } from "@/hooks/useTaskWebSocket";

export interface EventTimelineProps {
  events: RalphEvent[];
}

type EventColor = "blue" | "red" | "green" | "gray";

function classifyEvent(event: RalphEvent): EventColor {
  const topic = event.topic.toLowerCase();
  // Backpressure/confession failures → red
  if (topic.includes("backpressure") && topic.includes("fail")) return "red";
  if (topic.includes("confession")) {
    const p = event.payload;
    if (p && typeof p === "object" && "status" in p) {
      const s = String((p as Record<string, unknown>).status).toLowerCase();
      if (s === "rejected" || s === "failed") return "red";
    }
    return "green";
  }
  if (topic.includes("backpressure")) return "red";
  // Completion → green
  if (topic.includes("complete") || topic.includes("done")) return "green";
  // Hat activation → blue
  if (topic.includes("hat")) return "blue";
  return "gray";
}

const colorClasses: Record<EventColor, { row: string; badge: string; dot: string }> = {
  blue: {
    row: "",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
    dot: "bg-blue-500",
  },
  red: {
    row: "bg-red-50 border-red-200",
    badge: "bg-red-100 text-red-800 border-red-200",
    dot: "bg-red-500",
  },
  green: {
    row: "",
    badge: "bg-green-100 text-green-800 border-green-200",
    dot: "bg-green-500",
  },
  gray: {
    row: "",
    badge: "bg-gray-100 text-gray-800 border-gray-200",
    dot: "bg-gray-400",
  },
};

function formatPayload(payload: RalphEvent["payload"]): string {
  if (payload === null) return "";
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload, null, 2);
}

function previewPayload(payload: RalphEvent["payload"]): string {
  if (payload === null) return "";
  if (typeof payload === "string") return payload;
  const keys = Object.keys(payload);
  return keys.slice(0, 3).join(", ") + (keys.length > 3 ? "…" : "");
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

export function EventTimeline({ events }: EventTimelineProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (events.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No events yet"
        description="Events will appear here as the loop runs."
      />
    );
  }

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div data-testid="event-timeline" className="space-y-0">
      {events.map((event, i) => {
        const color = classifyEvent(event);
        const cls = colorClasses[color];
        const isOpen = expanded.has(i);
        const full = formatPayload(event.payload);

        return (
          <div key={i}>
            <div
              data-testid={`event-row-${i}`}
              role="button"
              tabIndex={0}
              onClick={() => toggle(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") toggle(i);
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm cursor-pointer border-b hover:bg-muted/50 transition-colors",
                cls.row
              )}
            >
              <div className={cn("h-2 w-2 shrink-0 rounded-full", cls.dot)} />
              <span
                className={cn(
                  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                  cls.badge
                )}
              >
                {event.topic}
              </span>
              {event.hat && (
                <span className="text-xs text-muted-foreground">{event.hat}</span>
              )}
              {event.iteration != null && (
                <span className="text-xs text-muted-foreground">#{event.iteration}</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                {formatTime(event.ts)}
              </span>
              {!isOpen && full && (
                <span className="truncate max-w-[200px] text-xs text-muted-foreground">
                  {typeof event.payload === "string"
                    ? event.payload
                    : previewPayload(event.payload)}
                </span>
              )}
            </div>
            {isOpen && full && (
              <pre className="bg-muted/30 px-6 py-2 text-xs overflow-x-auto border-b whitespace-pre-wrap">
                {full}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
