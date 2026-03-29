/**
 * RPC Client Tests — MUTATING_METHODS
 *
 * Verifies that project.add and project.remove are treated as mutating.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { rpcCall } from "./client";

describe("rpcCall — project mutation methods", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ apiVersion: "v1", id: "req-1", result: {} }),
    });
  });

  it("project.add sends idempotencyKey (is mutating)", async () => {
    await rpcCall("project.add", { path: "/tmp/test" });
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.meta).toBeDefined();
    expect(body.meta.idempotencyKey).toMatch(/^idem-project-add-/);
  });

  it("project.remove sends idempotencyKey (is mutating)", async () => {
    await rpcCall("project.remove", { id: "proj-1" });
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.meta).toBeDefined();
    expect(body.meta.idempotencyKey).toMatch(/^idem-project-remove-/);
  });

  it("project.list does NOT send idempotencyKey (is read-only)", async () => {
    await rpcCall("project.list", {});
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.meta).toBeUndefined();
  });
});
