/**
 * TaskThread Component Tests - Navigation Behavior
 *
 * Tests that TaskThread navigates to /tasks/:id instead of
 * expanding inline content. This follows the list-to-detail
 * pattern used by GitHub Issues, Linear, Jira, etc.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// Mock react-router-dom useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock tRPC hooks — trackable mutate fns for action button tests
const mockMutate = {
  run: vi.fn(),
  retry: vi.fn(),
  cancel: vi.fn(),
  delete: vi.fn(),
  loopMerge: vi.fn(),
  loopDiscard: vi.fn(),
  loopStop: vi.fn(),
  loopRetry: vi.fn(),
};

vi.mock("@/trpc", () => {
  const noop = () => {};
  const createMockMutation = (mutateFn: (...args: any[]) => void = noop) => ({
    mutate: mutateFn,
    mutateAsync: mutateFn,
    isPending: false,
    isError: false,
    error: null,
  });

  return {
    trpc: {
      task: {
        run: { useMutation: () => createMockMutation(mockMutate.run) },
        retry: { useMutation: () => createMockMutation(mockMutate.retry) },
        cancel: { useMutation: () => createMockMutation(mockMutate.cancel) },
        delete: { useMutation: () => createMockMutation(mockMutate.delete) },
      },
      loops: {
        retry: { useMutation: () => createMockMutation(mockMutate.loopRetry) },
        merge: { useMutation: () => createMockMutation(mockMutate.loopMerge) },
        discard: { useMutation: () => createMockMutation(mockMutate.loopDiscard) },
        stop: { useMutation: () => createMockMutation(mockMutate.loopStop) },
      },
      useUtils: () => ({
        task: { list: { invalidate: noop } },
        loops: { list: { invalidate: noop } },
      }),
    },
  };
});

// Mock the UI store - currently used for expand state, but after refactoring
// should NOT be needed for navigation behavior
const mockToggleTaskExpanded = vi.fn();
vi.mock("@/store", () => ({
  useUIStore: vi.fn((selector: (state: unknown) => unknown) => {
    // Provide a mock state that the selector can use
    const mockState = {
      expandedTasks: new Set<string>(),
      toggleTaskExpanded: mockToggleTaskExpanded,
    };
    return selector(mockState);
  }),
}));

import { TaskThread, type Task } from "./TaskThread";

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const mockTask: Task = {
  id: "task-123",
  title: "Test task for navigation",
  status: "open",
  priority: 2,
  blockedBy: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("TaskThread navigation behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper to find the task card element.
   * After refactoring, this should be role="link", but currently it's role="button".
   * We find by the task title text and traverse up to the card container.
   */
  function getTaskCard(): HTMLElement {
    const titleElement = screen.getByText(mockTask.title);
    // Find the outermost Card element (has rounded-xl class)
    let current: HTMLElement | null = titleElement;
    while (current && !current.classList?.contains("rounded-xl")) {
      current = current.parentElement;
    }
    if (!current) throw new Error("Could not find task card");
    return current;
  }

  describe("click-to-navigate", () => {
    it("navigates to /tasks/:id when clicked", () => {
      // Given: A TaskThread component rendered with a task
      render(<TaskThread task={mockTask} />, { wrapper: createTestWrapper() });

      // When: User clicks on the task card
      const taskCard = getTaskCard();
      fireEvent.click(taskCard);

      // Then: Should navigate to the task detail page (NOT toggle expand state)
      expect(mockNavigate).toHaveBeenCalledWith(`/tasks/${mockTask.id}`);
    });

    it("navigates to /tasks/:id when Enter key is pressed", () => {
      // Given: A TaskThread component rendered with a task
      render(<TaskThread task={mockTask} />, { wrapper: createTestWrapper() });

      // When: User presses Enter on the task card
      const taskCard = getTaskCard();
      fireEvent.keyDown(taskCard, { key: "Enter" });

      // Then: Should navigate to the task detail page
      expect(mockNavigate).toHaveBeenCalledWith(`/tasks/${mockTask.id}`);
    });

    it("navigates to /tasks/:id when Space key is pressed", () => {
      // Given: A TaskThread component rendered with a task
      render(<TaskThread task={mockTask} />, { wrapper: createTestWrapper() });

      // When: User presses Space on the task card
      const taskCard = getTaskCard();
      fireEvent.keyDown(taskCard, { key: " " });

      // Then: Should navigate to the task detail page
      expect(mockNavigate).toHaveBeenCalledWith(`/tasks/${mockTask.id}`);
    });
  });

  describe("no expand/collapse UI", () => {
    it("does not render chevron icons", () => {
      // Given: A TaskThread component rendered with a task
      render(<TaskThread task={mockTask} />, { wrapper: createTestWrapper() });

      // Then: No chevron icons should be present
      // Chevrons were used for expand/collapse indication
      // lucide-react adds class like "lucide-chevron-right" to SVGs
      const chevronRight = document.querySelector(".lucide-chevron-right");
      const chevronDown = document.querySelector(".lucide-chevron-down");

      expect(chevronRight).not.toBeInTheDocument();
      expect(chevronDown).not.toBeInTheDocument();
    });

    it("does not have aria-expanded attribute", () => {
      // Given: A TaskThread component rendered with a task
      render(<TaskThread task={mockTask} />, { wrapper: createTestWrapper() });

      // Then: The card should not have aria-expanded since it's not expandable
      const taskCard = getTaskCard();
      expect(taskCard).not.toHaveAttribute("aria-expanded");
    });

    it("does not render expanded content section", () => {
      // Given: A TaskThread component rendered with a task
      render(<TaskThread task={mockTask} />, { wrapper: createTestWrapper() });

      // Then: There should be no expanded content area
      // The old implementation had a CardContent with expanded details
      expect(screen.queryByText(/Created:/)).not.toBeInTheDocument();
    });
  });

  describe("action buttons do not navigate", () => {
    it("Run button does not trigger navigation", () => {
      // Given: An open task with a Run button
      render(<TaskThread task={mockTask} />, { wrapper: createTestWrapper() });

      // When: User clicks the actual Run button (not the card which also has role="button")
      // The Run button has "Run" text visible
      const runButton = screen.getByText("Run").closest("button");
      expect(runButton).not.toBeNull();
      fireEvent.click(runButton!);

      // Then: Should NOT navigate (action buttons should stop propagation)
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("merge loop visual distinction", () => {
    it("shows green left border for merge loop tasks (merging status)", () => {
      // Given: A task with a loop in "merging" status
      const loop = {
        id: "loop-123",
        status: "merging" as const,
        location: ".worktrees/ralph-test",
        prompt: "Test merge loop",
      };
      render(<TaskThread task={mockTask} loop={loop} />, {
        wrapper: createTestWrapper(),
      });

      // Then: The card should have the green left border class
      const taskCard = getTaskCard();
      expect(taskCard).toHaveClass("border-l-4");
      expect(taskCard).toHaveClass("border-l-green-500/60");
    });

    it("shows green left border for tasks with needs-review status", () => {
      // Given: A task with a loop in "needs-review" status
      const loop = {
        id: "loop-123",
        status: "needs-review" as const,
        location: ".worktrees/ralph-test",
        prompt: "Test merge loop",
      };
      render(<TaskThread task={mockTask} loop={loop} />, {
        wrapper: createTestWrapper(),
      });

      // Then: The card should have the green left border class
      const taskCard = getTaskCard();
      expect(taskCard).toHaveClass("border-l-4");
    });

    it("does not show green left border for regular running loops", () => {
      // Given: A task with a loop in "running" status (not merge-related)
      const loop = {
        id: "loop-123",
        status: "running" as const,
        location: ".worktrees/ralph-test",
        prompt: "Regular dev loop",
      };
      render(<TaskThread task={mockTask} loop={loop} />, {
        wrapper: createTestWrapper(),
      });

      // Then: The card should NOT have the green left border class
      const taskCard = getTaskCard();
      expect(taskCard).not.toHaveClass("border-l-4");
    });
  });

  describe("inline action buttons by status", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.spyOn(window, "confirm").mockReturnValue(true);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** Find an inline action button by its label text (avoids matching the Card role="button") */
    function getActionButton(label: string): HTMLButtonElement {
      const btn = screen.getByText(label).closest("button");
      if (!btn) throw new Error(`Could not find <button> for "${label}"`);
      return btn as HTMLButtonElement;
    }

    it("shows Stop and Force Stop buttons for running tasks", () => {
      const runningTask: Task = { ...mockTask, status: "running" };
      render(<TaskThread task={runningTask} />, { wrapper: createTestWrapper() });

      expect(getActionButton("Stop")).toBeInTheDocument();
      expect(getActionButton("Force Stop")).toBeInTheDocument();
    });

    it("Stop button calls task.cancel with confirmation", () => {
      const runningTask: Task = { ...mockTask, status: "running" };
      render(<TaskThread task={runningTask} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Stop"));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockMutate.cancel).toHaveBeenCalledWith({ id: mockTask.id });
    });

    it("Stop button also calls loop.stop when loop is associated", () => {
      const runningTask: Task = { ...mockTask, status: "running" };
      const loop = { id: "loop-abc", status: "running", location: "(in-place)" } as any;
      render(<TaskThread task={runningTask} loop={loop} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Stop"));

      expect(mockMutate.cancel).toHaveBeenCalledWith({ id: mockTask.id });
      expect(mockMutate.loopStop).toHaveBeenCalledWith({ id: "loop-abc" });
    });

    it("Force Stop button calls task.cancel with force and loop.stop with force", () => {
      const runningTask: Task = { ...mockTask, status: "running" };
      const loop = { id: "loop-abc", status: "running", location: "(in-place)" } as any;
      render(<TaskThread task={runningTask} loop={loop} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Force Stop"));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockMutate.cancel).toHaveBeenCalledWith({ id: mockTask.id, force: true });
      expect(mockMutate.loopStop).toHaveBeenCalledWith({ id: "loop-abc", force: true });
    });

    it("Stop button does not call mutations when confirmation is declined", () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const runningTask: Task = { ...mockTask, status: "running" };
      render(<TaskThread task={runningTask} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Stop"));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockMutate.cancel).not.toHaveBeenCalled();
    });

    it("Force Stop button does not call mutations when confirmation is declined", () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const runningTask: Task = { ...mockTask, status: "running" };
      render(<TaskThread task={runningTask} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Force Stop"));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockMutate.cancel).not.toHaveBeenCalled();
    });

    it("shows Delete button for failed tasks", () => {
      const failedTask: Task = { ...mockTask, status: "failed" };
      render(<TaskThread task={failedTask} />, { wrapper: createTestWrapper() });

      expect(getActionButton("Delete")).toBeInTheDocument();
    });

    it("shows Delete button for completed tasks", () => {
      const completedTask: Task = { ...mockTask, status: "completed" };
      render(<TaskThread task={completedTask} />, { wrapper: createTestWrapper() });

      expect(getActionButton("Delete")).toBeInTheDocument();
    });

    it("shows Delete button for closed tasks", () => {
      const closedTask: Task = { ...mockTask, status: "closed" };
      render(<TaskThread task={closedTask} />, { wrapper: createTestWrapper() });

      expect(getActionButton("Delete")).toBeInTheDocument();
    });

    it("Delete button calls task.delete with confirmation", () => {
      const failedTask: Task = { ...mockTask, status: "failed" };
      render(<TaskThread task={failedTask} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Delete"));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockMutate.delete).toHaveBeenCalledWith({ id: mockTask.id });
    });

    it("Delete button does not call task.delete when confirmation is declined", () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const failedTask: Task = { ...mockTask, status: "failed" };
      render(<TaskThread task={failedTask} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Delete"));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockMutate.delete).not.toHaveBeenCalled();
    });

    it("does not show Stop or Delete for open tasks (only Run)", () => {
      render(<TaskThread task={mockTask} />, { wrapper: createTestWrapper() });

      expect(screen.queryByText("Stop")).not.toBeInTheDocument();
      expect(screen.queryByText("Force Stop")).not.toBeInTheDocument();
      expect(screen.queryByText("Delete")).not.toBeInTheDocument();
      expect(screen.getByText("Run")).toBeInTheDocument();
    });

    it("Stop button does not trigger navigation", () => {
      const runningTask: Task = { ...mockTask, status: "running" };
      render(<TaskThread task={runningTask} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Stop"));

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("Force Stop button does not trigger navigation", () => {
      const runningTask: Task = { ...mockTask, status: "running" };
      render(<TaskThread task={runningTask} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Force Stop"));

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("Delete button does not trigger navigation", () => {
      const failedTask: Task = { ...mockTask, status: "failed" };
      render(<TaskThread task={failedTask} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Delete"));

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    // --- Retry button tests ---

    it("shows Retry button for failed tasks", () => {
      const failedTask: Task = { ...mockTask, status: "failed" };
      render(<TaskThread task={failedTask} />, { wrapper: createTestWrapper() });

      expect(getActionButton("Retry")).toBeInTheDocument();
    });

    it("Retry button calls task.retry mutation", () => {
      const failedTask: Task = { ...mockTask, status: "failed" };
      render(<TaskThread task={failedTask} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Retry"));

      expect(mockMutate.retry).toHaveBeenCalledWith({ id: mockTask.id });
    });

    it("Retry button does not trigger navigation", () => {
      const failedTask: Task = { ...mockTask, status: "failed" };
      render(<TaskThread task={failedTask} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Retry"));

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    // --- Blocked task tests ---

    it("does not show Run button for open tasks with blockedBy set", () => {
      const blockedTask: Task = { ...mockTask, status: "open", blockedBy: "task-999" };
      render(<TaskThread task={blockedTask} />, { wrapper: createTestWrapper() });

      expect(screen.queryByText("Run")).not.toBeInTheDocument();
    });

    // --- Button visibility for other statuses ---

    it("does not show action buttons for pending tasks", () => {
      const pendingTask: Task = { ...mockTask, status: "pending" };
      render(<TaskThread task={pendingTask} />, { wrapper: createTestWrapper() });

      expect(screen.queryByText("Run")).not.toBeInTheDocument();
      expect(screen.queryByText("Stop")).not.toBeInTheDocument();
      expect(screen.queryByText("Retry")).not.toBeInTheDocument();
      expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    });

    it("does not show action buttons for cancelled tasks", () => {
      const cancelledTask: Task = { ...mockTask, status: "cancelled" };
      render(<TaskThread task={cancelledTask} />, { wrapper: createTestWrapper() });

      expect(screen.queryByText("Run")).not.toBeInTheDocument();
      expect(screen.queryByText("Stop")).not.toBeInTheDocument();
      expect(screen.queryByText("Retry")).not.toBeInTheDocument();
      // cancelled is not in canDelete (completed|failed|closed)
      expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    });

    // --- Stop/Force Stop without loop ---

    it("Stop without loop does not call loops.stop", () => {
      const runningTask: Task = { ...mockTask, status: "running" };
      render(<TaskThread task={runningTask} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Stop"));

      expect(mockMutate.cancel).toHaveBeenCalledWith({ id: mockTask.id });
      expect(mockMutate.loopStop).not.toHaveBeenCalled();
    });

    it("Force Stop without loop does not call loops.stop", () => {
      const runningTask: Task = { ...mockTask, status: "running" };
      render(<TaskThread task={runningTask} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Force Stop"));

      expect(mockMutate.cancel).toHaveBeenCalledWith({ id: mockTask.id, force: true });
      expect(mockMutate.loopStop).not.toHaveBeenCalled();
    });

    // --- Merge/Discard worktree button tests ---

    it("shows Merge and Discard buttons for worktree loop in needs-review status", () => {
      const loop = { id: "loop-wt", status: "needs-review" as const, location: ".worktrees/test", prompt: "p" };
      render(<TaskThread task={mockTask} loop={loop} />, { wrapper: createTestWrapper() });

      expect(getActionButton("Merge")).toBeInTheDocument();
      expect(getActionButton("Discard")).toBeInTheDocument();
    });

    it("shows Merge and Discard buttons for worktree loop in queued status", () => {
      const loop = { id: "loop-wt", status: "queued" as const, location: ".worktrees/test", prompt: "p" };
      render(<TaskThread task={mockTask} loop={loop} />, { wrapper: createTestWrapper() });

      expect(getActionButton("Merge")).toBeInTheDocument();
      expect(getActionButton("Discard")).toBeInTheDocument();
    });

    it("does not show Merge/Discard for in-place loops", () => {
      const loop = { id: "loop-ip", status: "needs-review" as const, location: "(in-place)", prompt: "p" };
      render(<TaskThread task={mockTask} loop={loop} />, { wrapper: createTestWrapper() });

      expect(screen.queryByText("Merge")).not.toBeInTheDocument();
      expect(screen.queryByText("Discard")).not.toBeInTheDocument();
    });

    it("does not show Merge/Discard for running worktree loops", () => {
      const loop = { id: "loop-wt", status: "running" as const, location: ".worktrees/test", prompt: "p" };
      render(<TaskThread task={mockTask} loop={loop} />, { wrapper: createTestWrapper() });

      expect(screen.queryByText("Merge")).not.toBeInTheDocument();
      expect(screen.queryByText("Discard")).not.toBeInTheDocument();
    });

    it("Merge button calls loops.merge with confirmation", () => {
      const loop = { id: "loop-wt", status: "needs-review" as const, location: ".worktrees/test", prompt: "p" };
      render(<TaskThread task={mockTask} loop={loop} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Merge"));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockMutate.loopMerge).toHaveBeenCalledWith({ id: "loop-wt" });
    });

    it("Merge button does not call mutation when confirmation is declined", () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const loop = { id: "loop-wt", status: "needs-review" as const, location: ".worktrees/test", prompt: "p" };
      render(<TaskThread task={mockTask} loop={loop} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Merge"));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockMutate.loopMerge).not.toHaveBeenCalled();
    });

    it("Discard button calls loops.discard with confirmation", () => {
      const loop = { id: "loop-wt", status: "needs-review" as const, location: ".worktrees/test", prompt: "p" };
      render(<TaskThread task={mockTask} loop={loop} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Discard"));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockMutate.loopDiscard).toHaveBeenCalledWith({ id: "loop-wt" });
    });

    it("Discard button does not call mutation when confirmation is declined", () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const loop = { id: "loop-wt", status: "needs-review" as const, location: ".worktrees/test", prompt: "p" };
      render(<TaskThread task={mockTask} loop={loop} />, { wrapper: createTestWrapper() });

      fireEvent.click(getActionButton("Discard"));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockMutate.loopDiscard).not.toHaveBeenCalled();
    });
  });
});
