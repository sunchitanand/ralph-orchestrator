/**
 * Presets Page
 *
 * Lists all hat presets grouped by source (builtin, directory, collection).
 * Each preset is shown as a Card with name, description, and source Badge.
 * Clicking a card shows a detail view with metadata and read-only YAML.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "@/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const SOURCE_ORDER = ["builtin", "directory", "collection"] as const;
const SOURCE_LABELS: Record<string, string> = {
  builtin: "Builtin",
  directory: "Directory",
  collection: "Collection",
};

export function PresetsPage() {
  const [selectedPreset, setSelectedPreset] = useState<any>(null);
  const navigate = useNavigate();
  const presetsQuery = trpc.presets.list.useQuery();
  const yamlQuery = trpc.presets.get.useQuery(
    selectedPreset ? { id: selectedPreset.id } : undefined,
    { enabled: !!selectedPreset },
  );
  const importMutation = trpc.collection.importYaml.useMutation();

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Presets</h1>
        <p className="text-muted-foreground text-sm mt-1">Browse available hat presets</p>
      </header>

      {presetsQuery.isLoading && (
        <p className="text-muted-foreground">Loading presets...</p>
      )}

      {presetsQuery.isError && (
        <div className="text-center py-8">
          <p className="text-destructive mb-2">Error loading presets</p>
          <Button variant="outline" onClick={() => presetsQuery.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {presetsQuery.data && presetsQuery.data.length === 0 && (
        <p className="text-muted-foreground">No presets found</p>
      )}

      {presetsQuery.data && presetsQuery.data.length > 0 && (
        <div className="space-y-8">
          {SOURCE_ORDER.filter((source) =>
            presetsQuery.data!.some((p: any) => p.source === source)
          ).map((source) => (
            <section key={source}>
              <h2 className="text-lg font-semibold mb-3">{SOURCE_LABELS[source]}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {presetsQuery.data!
                  .filter((p: any) => p.source === source)
                  .map((preset: any) => (
                    <Card
                      key={preset.id}
                      className="cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => setSelectedPreset(preset)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base">{preset.name}</CardTitle>
                          <Badge variant="secondary">{preset.source}</Badge>
                        </div>
                      </CardHeader>
                      {preset.description && (
                        <CardContent className="pt-0">
                          <p className="text-sm text-muted-foreground">{preset.description}</p>
                        </CardContent>
                      )}
                    </Card>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selectedPreset && (
        <div className="mt-8 border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">{selectedPreset.name}</h2>
              {selectedPreset.description && (
                <p className="text-sm text-muted-foreground mt-1">{selectedPreset.description}</p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedPreset(null)}>
              Close
            </Button>
          </div>
          <div className="flex gap-2 mb-4">
            <Badge data-testid="detail-source" variant="secondary">{selectedPreset.source}</Badge>
            {selectedPreset.category && (
              <Badge variant="outline">{selectedPreset.category}</Badge>
            )}
          </div>
          {yamlQuery.isLoading && (
            <p className="text-muted-foreground">Loading YAML...</p>
          )}
          {yamlQuery.data && (
            <pre className="bg-muted rounded-md p-4 overflow-x-auto text-sm">
              <code data-testid="yaml-content">{yamlQuery.data.yaml}</code>
            </pre>
          )}
          {selectedPreset.source === "builtin" && yamlQuery.data && (
            <Button
              className="mt-4"
              onClick={() =>
                importMutation.mutate(
                  { yaml: yamlQuery.data.yaml, name: selectedPreset.name },
                  { onSuccess: () => navigate("/builder") },
                )
              }
              disabled={importMutation.isPending}
            >
              Open in Builder
            </Button>
          )}
        </div>
      )}
    </>
  );
}
