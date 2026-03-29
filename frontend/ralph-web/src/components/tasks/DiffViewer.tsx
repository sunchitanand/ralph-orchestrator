/**
 * DiffViewer Component
 *
 * Renders a file list with expandable diffs.
 * Each file shows path, status, +/- stats.
 * Clicking a filename expands to show the full diff.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface DiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  diff: string;
}

export interface DiffViewerProps {
  files: DiffFile[];
}

function DiffLine({ line, index }: { line: string; index: number }) {
  const type = line.startsWith("+") && !line.startsWith("+++")
    ? "addition"
    : line.startsWith("-") && !line.startsWith("---")
      ? "deletion"
      : line.startsWith("@@")
        ? "hunk"
        : "context";

  const colors: Record<string, string> = {
    addition: "bg-green-500/15 text-green-400",
    deletion: "bg-red-500/15 text-red-400",
    hunk: "text-blue-400",
    context: "text-muted-foreground",
  };

  return (
    <div key={index} className={colors[type]} data-diff-type={type}>
      {line}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  modified: "text-yellow-500",
  added: "text-green-500",
  deleted: "text-red-500",
};

export function DiffViewer({ files }: DiffViewerProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No changes</p>;
  }

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <div className="space-y-1">
      {files.map((file, i) => (
        <div key={file.path}>
          <button
            type="button"
            onClick={() => toggle(i)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-mono hover:bg-muted/50 rounded transition-colors"
          >
            {expanded.has(i) ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            <span className="flex-1 text-left truncate">{file.path}</span>
            <span className={`text-xs ${STATUS_COLORS[file.status] ?? "text-muted-foreground"}`}>
              {file.status}
            </span>
            {file.additions > 0 && (
              <span className="text-green-500 text-xs">+{file.additions}</span>
            )}
            {file.deletions > 0 && (
              <span className="text-red-500 text-xs">-{file.deletions}</span>
            )}
          </button>
          {expanded.has(i) && (
            <pre
              data-testid={`diff-content-${i}`}
              className="text-xs font-mono overflow-x-auto p-3 bg-muted/30 rounded mx-3 mb-2"
            >
              {file.diff.split("\n").map((line, j) => (
                <DiffLine key={j} line={line} index={j} />
              ))}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
