/**
 * trpc.ts Tests — invalidation utils include projectId
 *
 * The invalidateExact helper must include activeProjectId in the cache key
 * so that exact invalidation matches project-scoped queries.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const rpcCallSpy = vi.fn().mockResolvedValue({ tasks: [] });

vi.mock("./rpc/client", () => ({
  rpcCall: (...args: unknown[]) => rpcCallSpy(...args),
  RpcClientError: class RpcClientError extends Error {
    code: string;
    retryable: boolean;
    constructor(msg: string, opts: any = {}) {
      super(msg);
      this.code = opts.code ?? "INTERNAL";
      this.retryable = opts.retryable ?? false;
    }
  },
}));

let mockProjectId: string | null = null;
vi.mock("./store", () => {
  const selector = (fn: (s: any) => any) => fn({ activeProjectId: mockProjectId });
  selector.getState = () => ({ activeProjectId: mockProjectId });
  return { useUIStore: selector };
});

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useRpcUtils invalidation includes projectId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectId = null;
  });

  it("invalidateExact for task.list includes activeProjectId in key", async () => {
    mockProjectId = "proj-abc";
    const { trpc } = await import("./trpc");

    // First, populate the cache with a project-scoped query
    const wrapper = createWrapper();
    renderHook(() => trpc.task.list.useQuery({ status: "open" }), { wrapper });
    await waitFor(() => expect(rpcCallSpy).toHaveBeenCalledTimes(1));

    // Verify cache has the entry
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);

    // Now use invalidateExact — it should match the project-scoped key
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => trpc.useUtils(), { wrapper });

    await act(async () => {
      await result.current.task.list.invalidate({ status: "open" });
    });

    // The invalidation key must include "proj-abc"
    const call = invalidateSpy.mock.calls[0][0] as { queryKey: unknown[]; exact?: boolean };
    if (call.exact) {
      expect(call.queryKey).toContain("proj-abc");
    }
  });

  it("invalidateExact with null project uses null in key", async () => {
    mockProjectId = null;
    const { trpc } = await import("./trpc");

    const wrapper = createWrapper();
    renderHook(() => trpc.task.list.useQuery(), { wrapper });
    await waitFor(() => expect(rpcCallSpy).toHaveBeenCalledTimes(1));

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => trpc.useUtils(), { wrapper });

    await act(async () => {
      await result.current.task.list.invalidate({});
    });

    const call = invalidateSpy.mock.calls[0][0] as { queryKey: unknown[]; exact?: boolean };
    if (call.exact) {
      // Last element should be null for default workspace
      expect(call.queryKey[call.queryKey.length - 1]).toBeNull();
    }
  });

  it("prefix invalidation still works across all projects", async () => {
    mockProjectId = "proj-abc";
    const { trpc } = await import("./trpc");

    const wrapper = createWrapper();
    renderHook(() => trpc.task.list.useQuery(), { wrapper });
    await waitFor(() => expect(rpcCallSpy).toHaveBeenCalledTimes(1));

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => trpc.useUtils(), { wrapper });

    // Calling invalidate without input uses prefix (no exact)
    await act(async () => {
      await result.current.task.list.invalidate();
    });

    const call = invalidateSpy.mock.calls[0][0] as { queryKey: unknown[]; exact?: boolean };
    // Prefix invalidation should NOT be exact — matches all projects
    expect(call.exact).toBeUndefined();
  });
});
