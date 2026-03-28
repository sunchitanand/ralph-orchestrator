# Spec: Presets Browser Page

## Goal

Add a Presets page to the web dashboard that lets users browse all available hat
collections (builtins + user-created), view their YAML, and open them in the
Builder for editing.

## Background

The API already exposes `preset.list` which returns builtin presets (from
`presets/index.json`) plus any user collections. The frontend has no page to
display these. The Builder page only shows user-created collections, not builtins.
The Settings page shows a read-only dropdown of presets but nothing more.

## Acceptance Criteria

1. A new `/presets` route and `PresetsPage` component exists
2. The page lists all presets returned by `preset.list`, grouped by source
   (`builtin`, `directory`, `collection`)
3. Each preset card shows: name, description, category/source badge
4. Clicking a preset opens a detail view showing:
   - Metadata (name, description, source, category)
   - Full YAML content in a syntax-highlighted read-only code block
5. Builtin presets have an "Open in Builder" button that imports the YAML into
   a new collection and navigates to `/builder` to edit it
6. The Presets page is accessible from the sidebar nav (between Builder and
   Settings), using the `Library` icon from lucide-react
7. Existing tests pass. New components have basic render tests.

## Out of Scope

- Editing builtins in-place (they open as a new copy in Builder)
- Creating presets from the Presets page (use Builder for that)
- Wave/concurrency config visualization

## Implementation Notes

- Use `trpc.presets.list` (already wired in `src/trpc.ts`) for data fetching
- `preset.list` returns only metadata (id, name, source, description, path) —
  no YAML content. A `preset.get` RPC method needs to be added to the API that
  reads and returns the YAML content for a given preset id
- For "Open in Builder": fetch YAML via `preset.get`, call
  `trpc.collection.importYaml`, then navigate to `/builder`
- Add `preset.get` to: `crates/ralph-api/src/preset_domain.rs`,
  `crates/ralph-api/src/protocol.rs` (KNOWN_METHODS), the dispatch handler,
  and `src/trpc.ts` in the frontend
- Follow existing page patterns: `TasksPage`, `BuilderPage` for structure
- Follow existing component patterns in `src/components/` for cards, badges,
  code display
- Add route to `App.tsx` and nav item to `Sidebar.tsx`

## Files to Create/Modify

- `frontend/ralph-web/src/pages/PresetsPage.tsx` (new)
- `frontend/ralph-web/src/pages/PresetsPage.test.tsx` (new)
- `frontend/ralph-web/src/pages/index.ts` (export PresetsPage)
- `frontend/ralph-web/src/App.tsx` (add /presets route)
- `frontend/ralph-web/src/components/layout/Sidebar.tsx` (add nav item)
