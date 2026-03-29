/**
 * EnhancedLogViewer ANSI Rendering Tests
 *
 * Tests for ANSI color code parsing in log output:
 * - Plain text renders unchanged
 * - ANSI color codes render as colored spans
 * - ANSI codes are stripped from copy-to-clipboard text
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EnhancedLogViewer } from "./EnhancedLogViewer";

// Mock useTaskWebSocket to control log entries
const mockClearEntries = vi.fn();
vi.mock("@/hooks/useTaskWebSocket", () => ({
  useTaskWebSocket: vi.fn(() => ({
    entries: [],
    connectionState: "connected" as const,
    error: null,
    clearEntries: mockClearEntries,
    latestEntry: null,
    events: [],
    latestEvent: null,
    taskStatus: "unknown",
    currentIteration: null,
    currentHat: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

import { useTaskWebSocket } from "@/hooks/useTaskWebSocket";
import type { LogEntry } from "@/hooks/useTaskWebSocket";

const mockedUseTaskWebSocket = vi.mocked(useTaskWebSocket);

function makeEntry(line: string, source: "stdout" | "stderr" = "stdout"): LogEntry {
  return { line, timestamp: "2026-03-29T12:00:00Z", source };
}

function setEntries(
  entries: LogEntry[],
  overrides: { connectionState?: string; taskStatus?: string } = {}
) {
  mockedUseTaskWebSocket.mockReturnValue({
    entries,
    connectionState: (overrides.connectionState ?? "connected") as import("@/hooks/useTaskWebSocket").ConnectionState,
    error: null,
    clearEntries: mockClearEntries,
    latestEntry: entries[entries.length - 1] ?? null,
    events: [],
    latestEvent: null,
    taskStatus: overrides.taskStatus ?? "unknown",
    currentIteration: null,
    currentHat: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
}

describe("EnhancedLogViewer ANSI rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEntries([]);
  });

  it("renders plain text unchanged", () => {
    setEntries([makeEntry("Hello, world!")]);
    render(<EnhancedLogViewer taskId="task-1" />);

    expect(screen.getByText("Hello, world!")).toBeInTheDocument();
  });

  it("renders ANSI color codes as colored spans", () => {
    // \x1b[31m = red foreground, \x1b[0m = reset
    setEntries([makeEntry("\x1b[31mError: something failed\x1b[0m")]);
    render(<EnhancedLogViewer taskId="task-1" />);

    // The text should be visible (without raw ANSI escape sequences)
    expect(screen.getByText("Error: something failed")).toBeInTheDocument();

    // Should NOT show raw escape codes
    expect(screen.queryByText(/\x1b/)).not.toBeInTheDocument();
  });

  it("renders ANSI bold and color codes as styled HTML", () => {
    // \x1b[1;32m = bold green, \x1b[0m = reset
    setEntries([makeEntry("\x1b[1;32mSUCCESS\x1b[0m: tests passed")]);
    render(<EnhancedLogViewer taskId="task-1" />);

    // Find the log content container that uses dangerouslySetInnerHTML
    const logContent = screen.getByTestId("log-content-0");
    // Should contain a <span> with inline style for color
    expect(logContent.innerHTML).toContain("<span");
    expect(logContent.innerHTML).toContain("SUCCESS");
    expect(logContent.textContent).toBe("SUCCESS: tests passed");
  });

  it("strips ANSI codes from copy-to-clipboard for single line", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    setEntries([makeEntry("\x1b[31mred text\x1b[0m")]);
    render(<EnhancedLogViewer taskId="task-1" />);

    const copyButton = screen.getByLabelText("Copy line");
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("red text");
    });
  });

  it("strips ANSI codes from copy-all-to-clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    setEntries([
      makeEntry("\x1b[32mline one\x1b[0m"),
      makeEntry("\x1b[31mline two\x1b[0m"),
    ]);
    render(<EnhancedLogViewer taskId="task-1" />);

    // The copy-all button is the one with the Copy icon in the header (not labeled "Copy line")
    const copyAllButton = screen.getByTestId("copy-all-button");
    fireEvent.click(copyAllButton);

    await waitFor(() => {
      const calledWith = writeText.mock.calls[0][0] as string;
      // Should contain plain text without ANSI codes
      expect(calledWith).toContain("line one");
      expect(calledWith).toContain("line two");
      expect(calledWith).not.toContain("\x1b");
    });
  });

  it("does not bleed ANSI color state across re-renders", () => {
    // Render with a line that sets red without reset
    setEntries([
      makeEntry("plain first"),
      makeEntry("\x1b[31merror line"),
    ]);
    const { rerender } = render(<EnhancedLogViewer taskId="task-1" />);

    // Simulate new log line arriving → re-render with all entries
    setEntries([
      makeEntry("plain first"),
      makeEntry("\x1b[31merror line"),
      makeEntry("new plain line"),
    ]);
    rerender(<EnhancedLogViewer taskId="task-1" />);

    // "plain first" (line 0) must NOT have any color span — it has no ANSI codes
    const line0 = screen.getByTestId("log-content-0");
    expect(line0.innerHTML).not.toContain("<span");
    expect(line0.textContent).toBe("plain first");

    // "new plain line" (line 2) must NOT inherit red from line 1
    const line2 = screen.getByTestId("log-content-2");
    expect(line2.innerHTML).not.toContain("<span");
    expect(line2.textContent).toBe("new plain line");
  });
});

describe("EnhancedLogViewer completion status banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEntries([]);
  });

  it("does not show a completion banner when task is running", () => {
    setEntries([makeEntry("doing work...")], { taskStatus: "running" });
    render(<EnhancedLogViewer taskId="task-1" />);

    expect(screen.queryByTestId("completion-banner")).not.toBeInTheDocument();
  });

  it("shows green banner when task closes successfully (backend sends 'closed')", () => {
    setEntries([makeEntry("done")], { taskStatus: "closed" });
    render(<EnhancedLogViewer taskId="task-1" />);

    const banner = screen.getByTestId("completion-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/completed/i);
    expect(banner.className).toMatch(/green/);
  });

  it("shows red failed banner when task fails", () => {
    setEntries([makeEntry("error")], { taskStatus: "failed" });
    render(<EnhancedLogViewer taskId="task-1" />);

    const banner = screen.getByTestId("completion-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/failed/i);
    expect(banner.className).toMatch(/red/);
  });

  it("shows completion banner instead of Disconnected empty state when stream ends with terminal status", () => {
    setEntries([], { connectionState: "disconnected", taskStatus: "closed" });
    render(<EnhancedLogViewer taskId="task-1" />);

    const banner = screen.getByTestId("completion-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/completed/i);
  });
});

describe("EnhancedLogViewer scroll toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEntries([]);
  });

  it("renders auto-scroll toggle button in header", () => {
    setEntries([makeEntry("line 1")]);
    render(<EnhancedLogViewer taskId="task-1" />);

    const toggle = screen.getByTestId("auto-scroll-toggle");
    expect(toggle).toBeInTheDocument();
    // Default state: auto-scroll is on, so button offers to pause
    expect(toggle).toHaveTextContent(/pause/i);
  });

  it("clicking toggle pauses auto-scroll", () => {
    setEntries([makeEntry("line 1")]);
    render(<EnhancedLogViewer taskId="task-1" />);

    const toggle = screen.getByTestId("auto-scroll-toggle");
    expect(toggle).toHaveTextContent(/pause/i);

    fireEvent.click(toggle);

    // After clicking, auto-scroll is off — button now offers to resume
    expect(toggle).toHaveTextContent(/resume/i);
  });

  it("clicking toggle again resumes auto-scroll", () => {
    setEntries([makeEntry("line 1")]);
    render(<EnhancedLogViewer taskId="task-1" />);

    const toggle = screen.getByTestId("auto-scroll-toggle");

    // Pause
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent(/resume/i);

    // Resume
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent(/pause/i);
  });

  it("explicit pause is not overridden by scroll events at bottom", () => {
    setEntries([makeEntry("line 1")]);
    render(<EnhancedLogViewer taskId="task-1" />);

    const toggle = screen.getByTestId("auto-scroll-toggle");

    // Explicitly pause via toggle
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent(/resume/i);

    // Simulate a scroll event while at the bottom of the container
    const scrollContainer = toggle.closest("[style]")!.querySelector(".overflow-auto")!;
    // Mock scroll dimensions so atBottom = true
    Object.defineProperty(scrollContainer, "scrollTop", { value: 100, configurable: true, writable: true });
    Object.defineProperty(scrollContainer, "scrollHeight", { value: 110, configurable: true });
    Object.defineProperty(scrollContainer, "clientHeight", { value: 110, configurable: true });
    fireEvent.scroll(scrollContainer);

    // Explicit pause must hold — toggle should still show Resume
    expect(toggle).toHaveTextContent(/resume/i);
  });
});
