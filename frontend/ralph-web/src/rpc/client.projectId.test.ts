/**
 * RPC Client Tests — projectId injection
 *
 * AC1: rpcCall('task.list', {}, { projectId: 'abc' }) sends { projectId: 'abc' } in params
 * AC3: existing calls without projectId still work (backwards compat)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { rpcCall } from "./client";

function mockFetch() {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ apiVersion: "v1", id: "req-1", result: {} }),
  });
  global.fetch = fn;
  return fn;
}

function parseSentParams(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  return body.params as Record<string, unknown>;
}

describe("rpcCall — projectId injection", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("injects projectId into params for scoped methods", async () => {
    const fetchMock = mockFetch();
    await rpcCall("task.list", { status: "open" }, { projectId: "abc" });
    const params = parseSentParams(fetchMock);
    expect(params).toEqual({ status: "open", projectId: "abc" });
  });

  it("works without projectId (backwards compat)", async () => {
    const fetchMock = mockFetch();
    await rpcCall("task.list", { status: "open" });
    const params = parseSentParams(fetchMock);
    expect(params).toEqual({ status: "open" });
    expect(params).not.toHaveProperty("projectId");
  });

  it("does NOT inject projectId for project.* methods", async () => {
    const fetchMock = mockFetch();
    await rpcCall("project.list", {}, { projectId: "abc" });
    const params = parseSentParams(fetchMock);
    expect(params).not.toHaveProperty("projectId");
  });

  it("does NOT inject projectId for stream.* methods", async () => {
    const fetchMock = mockFetch();
    await rpcCall("stream.subscribe", { topics: ["test"] }, { projectId: "abc" });
    const params = parseSentParams(fetchMock);
    expect(params).not.toHaveProperty("projectId");
  });

  it("injects projectId for all scoped prefixes", async () => {
    const scoped = ["task.list", "loop.list", "config.get", "preset.list", "collection.list", "planning.list"];
    for (const method of scoped) {
      const fetchMock = mockFetch();
      await rpcCall(method, {}, { projectId: "proj-1" });
      const params = parseSentParams(fetchMock);
      expect(params.projectId).toBe("proj-1");
    }
  });

  it("does not inject projectId when it is undefined", async () => {
    const fetchMock = mockFetch();
    await rpcCall("task.list", {}, { projectId: undefined });
    const params = parseSentParams(fetchMock);
    expect(params).not.toHaveProperty("projectId");
  });
});
