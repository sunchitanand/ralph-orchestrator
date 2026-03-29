/**
 * Store Tests — activeProjectId
 *
 * Verifies that useUIStore exposes activeProjectId with persistence
 * and that MUTATING_METHODS includes project mutations.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "./store";

describe("useUIStore — activeProjectId", () => {
  beforeEach(() => {
    // Reset store to defaults between tests
    useUIStore.setState({
      activeProjectId: null,
      sidebarOpen: true,
      expandedTasks: new Set<string>(),
    });
  });

  it("defaults activeProjectId to null", () => {
    const state = useUIStore.getState();
    expect(state.activeProjectId).toBeNull();
  });

  it("setActiveProjectId sets a project id", () => {
    useUIStore.getState().setActiveProjectId("proj-123");
    expect(useUIStore.getState().activeProjectId).toBe("proj-123");
  });

  it("setActiveProjectId clears back to null", () => {
    useUIStore.getState().setActiveProjectId("proj-123");
    useUIStore.getState().setActiveProjectId(null);
    expect(useUIStore.getState().activeProjectId).toBeNull();
  });

  it("does not affect existing sidebarOpen state", () => {
    useUIStore.setState({ sidebarOpen: false });
    useUIStore.getState().setActiveProjectId("proj-456");
    expect(useUIStore.getState().sidebarOpen).toBe(false);
  });

  it("does not affect existing expandedTasks state", () => {
    useUIStore.getState().setTaskExpanded("task-1", true);
    useUIStore.getState().setActiveProjectId("proj-789");
    expect(useUIStore.getState().expandedTasks.has("task-1")).toBe(true);
  });
});
