/**
 * useTaskWebSocket — iteration/hat tracking tests
 *
 * Verifies that currentIteration and currentHat are extracted
 * from task.log.line WebSocket event payloads.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that use them
// ---------------------------------------------------------------------------

// Stable mock functions for logStore
const mockAppendLogs = vi.fn();
const mockClearLogs = vi.fn();
const storeState = {
  taskLogs: {} as Record<string, unknown[]>,
  taskLogMeta: {},
  appendLogs: mockAppendLogs,
  clearLogs: mockClearLogs,
  appendLog: vi.fn(),
  getLogs: () => [],
  hasLogs: () => false,
  getLogCount: () => 0,
  getLastLogId: () => null,
  getLastCursor: () => null,
};

vi.mock("@/stores/logStore", () => {
  const useLogStore = (selector: (s: typeof storeState) => unknown) => selector(storeState);
  useLogStore.getState = () => storeState;
  return { useLogStore };
});

vi.mock("@/rpc/client", () => ({
  rpcSubscribe: vi.fn().mockResolvedValue({
    subscriptionId: "sub-1",
    cursor: "cursor-0",
  }),
  rpcUnsubscribe: vi.fn().mockResolvedValue(undefined),
  rpcAck: vi.fn().mockResolvedValue(undefined),
  buildStreamWebSocketUrl: vi.fn().mockReturnValue("ws://localhost/stream"),
  RpcClientError: class RpcClientError extends Error {},
}));

import { useTaskWebSocket } from "./useTaskWebSocket";

// ---------------------------------------------------------------------------
// WebSocket mock
// ---------------------------------------------------------------------------

type WSHandler = ((ev: { data: string }) => void) | null;

let mockWs: {
  onopen: (() => void) | null;
  onmessage: WSHandler;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
};

function createMockWs() {
  mockWs = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    close: vi.fn(),
    readyState: 1,
  };
  return mockWs;
}

const OriginalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  globalThis.WebSocket = vi.fn().mockImplementation(() => createMockWs()) as unknown as typeof WebSocket;
});

afterEach(() => {
  globalThis.WebSocket = OriginalWebSocket;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendLogLine(payload: Record<string, unknown>, seq = 1) {
  mockWs.onmessage?.({
    data: JSON.stringify({
      topic: "task.log.line",
      cursor: `c-${seq}`,
      ts: new Date().toISOString(),
      sequence: seq,
      resource: { type: "task", id: "task-1" },
      replay: { mode: "live" },
      payload,
    }),
  });
}

async function connectAndOpen() {
  await vi.waitFor(() => {
    expect(globalThis.WebSocket).toHaveBeenCalled();
  });
  act(() => {
    mockWs.onopen?.();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useTaskWebSocket iteration/hat tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns currentIteration and currentHat with null defaults", () => {
    const { result } = renderHook(() => useTaskWebSocket("task-1", { autoConnect: false }));
    expect(result.current.currentIteration).toBeNull();
    expect(result.current.currentHat).toBeNull();
  });

  it("updates currentIteration and currentHat from task.log.line events", async () => {
    const { result } = renderHook(() => useTaskWebSocket("task-1"));

    await connectAndOpen();

    act(() => {
      sendLogLine({ line: "Building...", iteration: 3, hat: "Builder" });
    });

    expect(result.current.currentIteration).toBe(3);
    expect(result.current.currentHat).toBe("Builder");
  });

  it("updates to latest iteration/hat as new events arrive", async () => {
    const { result } = renderHook(() => useTaskWebSocket("task-1"));

    await connectAndOpen();

    act(() => {
      sendLogLine({ line: "Planning...", iteration: 1, hat: "Planner" }, 1);
    });
    expect(result.current.currentIteration).toBe(1);
    expect(result.current.currentHat).toBe("Planner");

    act(() => {
      sendLogLine({ line: "Building...", iteration: 2, hat: "Builder" }, 2);
    });
    expect(result.current.currentIteration).toBe(2);
    expect(result.current.currentHat).toBe("Builder");
  });

  it("resets currentIteration and currentHat when taskId changes", async () => {
    const { result, rerender } = renderHook(
      ({ taskId }: { taskId: string }) => useTaskWebSocket(taskId),
      { initialProps: { taskId: "task-1" } },
    );

    await connectAndOpen();

    act(() => {
      sendLogLine({ line: "Building...", iteration: 5, hat: "Builder" });
    });
    expect(result.current.currentIteration).toBe(5);
    expect(result.current.currentHat).toBe("Builder");

    // Switch to a different task
    rerender({ taskId: "task-2" });

    expect(result.current.currentIteration).toBeNull();
    expect(result.current.currentHat).toBeNull();
  });

  it("keeps previous values when log line has no iteration/hat", async () => {
    const { result } = renderHook(() => useTaskWebSocket("task-1"));

    await connectAndOpen();

    act(() => {
      sendLogLine({ line: "Building...", iteration: 3, hat: "Builder" }, 1);
    });
    expect(result.current.currentIteration).toBe(3);

    act(() => {
      sendLogLine({ line: "Still building..." }, 2);
    });
    expect(result.current.currentIteration).toBe(3);
    expect(result.current.currentHat).toBe("Builder");
  });
});
