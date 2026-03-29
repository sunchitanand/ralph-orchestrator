/**
 * LoopsPage Component Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LoopsPage } from "./LoopsPage";

// Mock trpc
vi.mock("@/trpc", () => ({
  trpc: {
    loops: {
      list: { useQuery: vi.fn() },
      managerStatus: { useQuery: vi.fn() },
      stop: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn() })) },
      discard: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn() })) },
      retry: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn() })) },
      merge: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn() })) },
    },
    useUtils: vi.fn(() => ({
      loops: { list: { invalidate: vi.fn() } },
    })),
  },
}));

// Mock child components
vi.mock("@/components/tasks", () => ({
  LoopBadge: ({ status }: { status: string }) => (
    <span data-testid="loop-badge">{status}</span>
  ),
  LoopActions: ({ id, status }: { id: string; status: string }) => (
    <div data-testid={`loop-actions-${id}`}>actions-{status}</div>
  ),
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      <span>{description}</span>
    </div>
  ),
  WorktreeBadge: ({ loopId }: { loopId: string }) => (
    <span data-testid="worktree-badge">{loopId}</span>
  ),
}));

const mockLoops = [
  {
    id: "primary-20260329-105309",
    status: "running",
    location: "(in-place)",
    prompt: "Implement the dashboard feature with all the bells and whistles",
    startedAt: "2026-03-29T10:53:09Z",
  },
  {
    id: "loop-fair-fox-abc123",
    status: "queued",
    location: ".worktrees/fair-fox",
    prompt: "Add footer after </p>",
    startedAt: "2026-03-29T11:00:00Z",
  },
  {
    id: "loop-bold-cat-def456",
    status: "needs-review",
    location: ".worktrees/bold-cat",
    prompt: "Fix the broken tests",
    startedAt: "2026-03-29T09:00:00Z",
    failureReason: "Merge conflict in src/main.rs",
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <LoopsPage />
    </MemoryRouter>
  );
}

async function mockTrpc(overrides: {
  loops?: { data?: any[]; isLoading?: boolean; isError?: boolean };
  manager?: { data?: any; isLoading?: boolean };
}) {
  const { trpc } = await import("@/trpc");
  vi.mocked(trpc.loops.list.useQuery).mockReturnValue({
    data: overrides.loops?.data ?? mockLoops,
    isLoading: overrides.loops?.isLoading ?? false,
    isError: overrides.loops?.isError ?? false,
  } as any);
  vi.mocked(trpc.loops.managerStatus.useQuery).mockReturnValue({
    data: overrides.manager?.data ?? { running: true, intervalMs: 5000 },
    isLoading: overrides.manager?.isLoading ?? false,
  } as any);
}

describe("LoopsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page header with title", async () => {
    await mockTrpc({});
    renderPage();
    expect(screen.getByText("Loops")).toBeInTheDocument();
  });

  it("renders loop cards with status badges", async () => {
    await mockTrpc({});
    renderPage();
    const badges = screen.getAllByTestId("loop-badge");
    expect(badges).toHaveLength(3);
    expect(badges[0]).toHaveTextContent("running");
    expect(badges[1]).toHaveTextContent("queued");
    expect(badges[2]).toHaveTextContent("needs-review");
  });

  it("renders loop IDs on cards", async () => {
    await mockTrpc({});
    renderPage();
    expect(screen.getByText("primary-2026")).toBeInTheDocument();
  });

  it("renders prompt preview truncated", async () => {
    await mockTrpc({});
    renderPage();
    // The long prompt should be truncated
    expect(screen.getByText(/Implement the dashboard/)).toBeInTheDocument();
    expect(screen.getByText("Add footer after </p>")).toBeInTheDocument();
  });

  it("renders action buttons per card", async () => {
    await mockTrpc({});
    renderPage();
    expect(screen.getByTestId("loop-actions-primary-20260329-105309")).toBeInTheDocument();
    expect(screen.getByTestId("loop-actions-loop-fair-fox-abc123")).toBeInTheDocument();
    expect(screen.getByTestId("loop-actions-loop-bold-cat-def456")).toBeInTheDocument();
  });

  it("shows needs-review loop with retry action", async () => {
    await mockTrpc({});
    renderPage();
    expect(screen.getByTestId("loop-actions-loop-bold-cat-def456")).toHaveTextContent("actions-needs-review");
  });

  it("uses 5s refetchInterval for auto-refresh", async () => {
    await mockTrpc({});
    renderPage();
    const { trpc } = await import("@/trpc");
    expect(trpc.loops.list.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ includeTerminal: false }),
      expect.objectContaining({ refetchInterval: 5000 })
    );
  });

  it("shows empty state when no loops", async () => {
    await mockTrpc({ loops: { data: [] } });
    renderPage();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("shows loading skeleton", async () => {
    await mockTrpc({ loops: { isLoading: true, data: undefined } });
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("filter toggle switches between Active and All", async () => {
    await mockTrpc({});
    renderPage();
    const allButton = screen.getByRole("button", { name: /all/i });
    fireEvent.click(allButton);
    const { trpc } = await import("@/trpc");
    // After clicking All, should re-render with includeTerminal: true
    expect(trpc.loops.list.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ includeTerminal: true }),
      expect.anything()
    );
  });

  it("shows manager status indicator when running", async () => {
    await mockTrpc({ manager: { data: { running: true, intervalMs: 5000 } } });
    renderPage();
    expect(screen.getByText(/manager/i)).toBeInTheDocument();
  });

  it("shows worktree badge for non-primary loops", async () => {
    await mockTrpc({});
    renderPage();
    const worktreeBadges = screen.getAllByTestId("worktree-badge");
    expect(worktreeBadges.length).toBeGreaterThanOrEqual(2);
  });
});
