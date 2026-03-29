/**
 * FolderPicker Component
 *
 * Modal dialog for browsing directories and adding projects.
 * Uses project.browse RPC to list directories and project.add to register.
 */

import { Folder, X } from "lucide-react";
import { useState } from "react";
import { rpcCall } from "@/rpc/client";

interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  hasRalphYml: boolean;
}

interface FolderPickerProps {
  open: boolean;
  onClose: () => void;
  onProjectAdded: () => void;
}

export function FolderPicker({ open, onClose, onProjectAdded }: FolderPickerProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<DirEntry[]>([]);

  if (!open) return null;

  async function browse(path: string) {
    setCurrentPath(path);
    const res = await rpcCall<{ entries: DirEntry[] }>("project.browse", { path });
    setEntries(res.entries.filter((e) => e.isDirectory));
  }

  async function handleAdd() {
    await rpcCall("project.add", { path: currentPath }, { mutating: true });
    onProjectAdded();
    onClose();
  }

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-medium">Add Project</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <input
              className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              placeholder="/path/to/project"
              value={currentPath}
              onChange={(e) => setCurrentPath(e.target.value)}
            />
            <button
              className="h-9 px-3 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80"
              onClick={() => browse(currentPath)}
            >
              Browse
            </button>
          </div>

          {entries.length > 0 && (
            <div className="border border-border rounded-md max-h-48 overflow-y-auto">
              {entries.map((entry) => (
                <button
                  key={entry.path}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent"
                  onClick={() => browse(entry.path)}
                >
                  <Folder className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate">{entry.name}</span>
                  {entry.hasRalphYml && (
                    <span className="ml-auto text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary flex-shrink-0">
                      ralph
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            className="h-8 px-3 rounded-md text-sm hover:bg-accent"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
            onClick={handleAdd}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
