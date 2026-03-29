/**
 * trpc.ts Tests — projectId in query keys and rpcCall options
 *
 * AC2: trpc query keys include projectId so React Query refetches on project change
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Track what rpcCall receives
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

// Control activeProjectId for tests
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

describe("trpc query keys include projectId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectId = null;
  });

  it("rpcCall receives projectId in options for scoped queries", async () => {
    mockProjectId = "proj-xyz";
    const { trpc } = await import("./trpc");

    renderHook(() => trpc.task.list.useQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(rpcCallSpy).toHaveBeenCalled());

    const callArgs = rpcCallSpy.mock.calls[0];
    expect(callArgs[0]).toBe("task.list");
    expect(callArgs[2]).toMatchObject({ projectId: "proj-xyz" });
  });

  it("query cache key includes projectId (different projects = different cache entries)", async () => {
    mockProjectId = "proj-a";
    const { trpc } = await import("./trpc");

    renderHook(() => trpc.task.list.useQuery({ status: "open" }), { wrapper: createWrapper() });
    await waitFor(() => expect(rpcCallSpy).toHaveBeenCalledTimes(1));

    // Check the query cache — key should contain "proj-a"
    const queries = queryClient.getQueryCache().getAll();
    expect(queries).toHaveLength(1);
    const key = queries[0].queryKey;
    expect(key).toContain("proj-a");
  });

  it("null projectId produces a cache key with null (default workspace)", async () => {
    mockProjectId = null;
    const { trpc } = await import("./trpc");

    renderHook(() => trpc.task.list.useQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(rpcCallSpy).toHaveBeenCalled());

    const queries = queryClient.getQueryCache().getAll();
    expect(queries).toHaveLength(1);
    const key = queries[0].queryKey;
    // Last element is null for default workspace
    expect(key[key.length - 1]).toBeNull();
  });

  it("rpcCall receives undefined projectId when no project selected", async () => {
    mockProjectId = null;
    const { trpc } = await import("./trpc");

    renderHook(() => trpc.task.list.useQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(rpcCallSpy).toHaveBeenCalled());

    const callArgs = rpcCallSpy.mock.calls[0];
    expect(callArgs[2]).toMatchObject({ projectId: undefined });
  });
});
