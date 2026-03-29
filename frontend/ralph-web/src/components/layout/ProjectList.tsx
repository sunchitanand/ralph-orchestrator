/**
 * ProjectList Component
 *
 * Sidebar section showing registered projects with active selection.
 * Fetches projects via project.list RPC and wires selection to Zustand store.
 */

import { FolderOpen, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { rpcCall } from "@/rpc/client";
import { useUIStore } from "@/store";
import { cn } from "@/lib/utils";
import { FolderPicker } from "./FolderPicker";

interface Project {
  id: string;
  name: string;
  path: string;
  isDefault?: boolean;
}

interface ProjectListProps {
  collapsed: boolean;
}

export function ProjectList({ collapsed }: ProjectListProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<Record<string, { tasks: number; loops: number }>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const { activeProjectId, setActiveProjectId } = useUIStore();

  const fetchCounts = (projs: Project[]) => {
    Promise.all(
      projs.map((p) =>
        Promise.all([
          rpcCall<{ tasks: { status: string }[] }>("task.list", {}, { projectId: p.id }).catch(() => ({ tasks: [] })),
          rpcCall<{ loops: { status: string }[] }>("loop.list", {}, { projectId: p.id }).catch(() => ({ loops: [] })),
        ]).then(([t, l]) => [p.id, { tasks: (t.tasks ?? []).length, loops: (l.loops ?? []).length }] as const)
      )
    ).then((entries) => setCounts(Object.fromEntries(entries)));
  };

  const fetchProjects = () => {
    rpcCall<{ projects: Project[] }>("project.list")
      .then((r) => {
        setProjects(r.projects);
        fetchCounts(r.projects);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  if (collapsed) {
    return (
      <div className="px-3 py-2 border-b border-border flex justify-center">
        <FolderOpen className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  const removeProject = (id: string) => {
    rpcCall("project.remove", { id }, { mutating: true }).then(() => {
      if (activeProjectId === id) setActiveProjectId(null);
      fetchProjects();
    });
  };

  return (
    <div className="border-b border-border px-2 py-2">
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Projects</span>
        <button
          className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-accent-foreground"
          title="Add project"
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-0.5">
        {projects.map((p) => {
          const isActive = p.isDefault ? activeProjectId === null : activeProjectId === p.id;
          return (
            <div key={p.id} className="flex items-center group">
              <button
                onClick={() => setActiveProjectId(p.isDefault ? null : p.id)}
                className={cn(
                  "flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md text-xs transition-colors text-left",
                  "hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-accent text-accent-foreground",
                  !isActive && "text-muted-foreground"
                )}
                title={p.path}
              >
                <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{p.name}</span>
                {p.isDefault && (
                  <span className="ml-auto text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                    default
                  </span>
                )}
                {(() => {
                  const c = counts[p.id];
                  if (!c || (c.tasks === 0 && c.loops === 0)) return null;
                  const parts: string[] = [];
                  if (c.tasks > 0) parts.push(`${c.tasks} task${c.tasks === 1 ? "" : "s"}`);
                  if (c.loops > 0) parts.push(`${c.loops} loop${c.loops === 1 ? "" : "s"}`);
                  return (
                    <span className="ml-auto text-[10px] text-muted-foreground flex-shrink-0">
                      {parts.map((text, i) => (
                        <span key={i} className="ml-1">{text}</span>
                      ))}
                    </span>
                  );
                })()}
              </button>
              {!p.isDefault && (
                <button
                  className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  title="Remove project"
                  onClick={() => removeProject(p.id)}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <FolderPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onProjectAdded={fetchProjects}
      />
    </div>
  );
}
