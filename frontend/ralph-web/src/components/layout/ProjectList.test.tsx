/**
 * ProjectList Component Tests
 *
 * Tests for the sidebar project list that fetches projects via RPC,
 * renders them with active highlight, and wires selection to the store.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock rpcCall
vi.mock("@/rpc/client", () => ({
  rpcCall: vi.fn(),
}));

// Mock store
const mockSetActiveProjectId = vi.fn();
vi.mock("@/store", () => ({
  useUIStore: vi.fn(),
}));

import { ProjectList } from "./ProjectList";
import { rpcCall } from "@/rpc/client";
import { useUIStore } from "@/store";

const mockProjects = [
  { id: "default", name: "ralph-orchestrator", path: "/home/user/ralph-orchestrator", isDefault: true },
  { id: "proj-abc", name: "my-project", path: "/home/user/my-project" },
];

function setupStore(overrides: { activeProjectId?: string | null; sidebarOpen?: boolean } = {}) {
  vi.mocked(useUIStore).mockReturnValue({
    activeProjectId: overrides.activeProjectId ?? null,
    setActiveProjectId: mockSetActiveProjectId,
    sidebarOpen: overrides.sidebarOpen ?? true,
  } as any);
}

describe("ProjectList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rpcCall).mockResolvedValue({ projects: mockProjects });
    setupStore();
  });

  it("fetches projects via rpcCall on mount", async () => {
    render(<ProjectList collapsed={false} />);

    await waitFor(() => {
      expect(rpcCall).toHaveBeenCalledWith("project.list");
    });
  });

  it("renders project names from RPC response", async () => {
    render(<ProjectList collapsed={false} />);

    await waitFor(() => {
      expect(screen.getByText("ralph-orchestrator")).toBeInTheDocument();
    });
    expect(screen.getByText("my-project")).toBeInTheDocument();
  });

  it("shows default badge for default workspace", async () => {
    render(<ProjectList collapsed={false} />);

    await waitFor(() => {
      expect(screen.getByText("default")).toBeInTheDocument();
    });
  });

  it("clicking a project calls setActiveProjectId", async () => {
    const user = userEvent.setup();
    render(<ProjectList collapsed={false} />);

    await waitFor(() => {
      expect(screen.getByText("my-project")).toBeInTheDocument();
    });

    await user.click(screen.getByText("my-project"));
    expect(mockSetActiveProjectId).toHaveBeenCalledWith("proj-abc");
  });

  it("clicking default project sets activeProjectId to null", async () => {
    const user = userEvent.setup();
    setupStore({ activeProjectId: "proj-abc" });
    render(<ProjectList collapsed={false} />);

    await waitFor(() => {
      expect(screen.getByText("ralph-orchestrator")).toBeInTheDocument();
    });

    await user.click(screen.getByText("ralph-orchestrator"));
    expect(mockSetActiveProjectId).toHaveBeenCalledWith(null);
  });

  it("active project has visual highlight", async () => {
    setupStore({ activeProjectId: "proj-abc" });
    render(<ProjectList collapsed={false} />);

    await waitFor(() => {
      expect(screen.getByText("my-project")).toBeInTheDocument();
    });

    const activeButton = screen.getByText("my-project").closest("button");
    expect(activeButton?.className).toMatch(/bg-accent/);
  });

  it("renders add project button", async () => {
    render(<ProjectList collapsed={false} />);

    await waitFor(() => {
      expect(screen.getByTitle("Add project")).toBeInTheDocument();
    });
  });

  it("collapsed mode shows folder icon only", async () => {
    render(<ProjectList collapsed={true} />);

    await waitFor(() => {
      expect(rpcCall).toHaveBeenCalledWith("project.list");
    });

    // Should not show project names in collapsed mode
    expect(screen.queryByText("ralph-orchestrator")).not.toBeInTheDocument();
    expect(screen.queryByText("my-project")).not.toBeInTheDocument();
  });

  it("shows remove button for non-default projects", async () => {
    render(<ProjectList collapsed={false} />);

    await waitFor(() => {
      expect(screen.getByText("my-project")).toBeInTheDocument();
    });

    expect(screen.getByTitle("Remove project")).toBeInTheDocument();
  });

  it("does not show remove button for default project", async () => {
    vi.mocked(rpcCall).mockResolvedValue({
      projects: [{ id: "default", name: "ralph-orchestrator", path: "/home/user/ralph", isDefault: true }],
    });
    render(<ProjectList collapsed={false} />);

    await waitFor(() => {
      expect(screen.getByText("ralph-orchestrator")).toBeInTheDocument();
    });

    expect(screen.queryByTitle("Remove project")).not.toBeInTheDocument();
  });

  it("clicking remove calls project.remove and refreshes list", async () => {
    const user = userEvent.setup();
    render(<ProjectList collapsed={false} />);

    await waitFor(() => {
      expect(screen.getByText("my-project")).toBeInTheDocument();
    });

    vi.mocked(rpcCall).mockResolvedValueOnce({});
    vi.mocked(rpcCall).mockResolvedValueOnce({
      projects: [{ id: "default", name: "ralph-orchestrator", path: "/home/user/ralph", isDefault: true }],
    });

    await user.click(screen.getByTitle("Remove project"));

    expect(rpcCall).toHaveBeenCalledWith("project.remove", { id: "proj-abc" }, { mutating: true });
    await waitFor(() => {
      expect(screen.queryByText("my-project")).not.toBeInTheDocument();
    });
  });

  it("removing active project resets activeProjectId to null", async () => {
    const user = userEvent.setup();
    setupStore({ activeProjectId: "proj-abc" });
    render(<ProjectList collapsed={false} />);

    await waitFor(() => {
      expect(screen.getByText("my-project")).toBeInTheDocument();
    });

    vi.mocked(rpcCall).mockResolvedValueOnce({});
    vi.mocked(rpcCall).mockResolvedValueOnce({
      projects: [{ id: "default", name: "ralph-orchestrator", path: "/home/user/ralph", isDefault: true }],
    });

    await user.click(screen.getByTitle("Remove project"));

    expect(mockSetActiveProjectId).toHaveBeenCalledWith(null);
  });

  describe("status counts", () => {
    it("fetches task.list and loop.list per project after project fetch", async () => {
      render(<ProjectList collapsed={false} />);

      await waitFor(() => {
        expect(rpcCall).toHaveBeenCalledWith("task.list", {}, { projectId: "default" });
        expect(rpcCall).toHaveBeenCalledWith("loop.list", {}, { projectId: "default" });
        expect(rpcCall).toHaveBeenCalledWith("task.list", {}, { projectId: "proj-abc" });
        expect(rpcCall).toHaveBeenCalledWith("loop.list", {}, { projectId: "proj-abc" });
      });
    });

    it("shows task and loop counts for projects with active items", async () => {
      vi.mocked(rpcCall).mockImplementation((method: string, _params?: any, opts?: any) => {
        if (method === "project.list") return Promise.resolve({ projects: mockProjects });
        if (method === "task.list" && opts?.projectId === "proj-abc")
          return Promise.resolve({ tasks: [{ status: "open" }, { status: "in_progress" }] });
        if (method === "loop.list" && opts?.projectId === "proj-abc")
          return Promise.resolve({ loops: [{ status: "running" }] });
        return Promise.resolve({ tasks: [], loops: [] });
      });

      render(<ProjectList collapsed={false} />);

      await waitFor(() => {
        expect(screen.getByText("2 tasks")).toBeInTheDocument();
        expect(screen.getByText("1 loop")).toBeInTheDocument();
      });
    });

    it("does not show counts for projects with zero active items", async () => {
      vi.mocked(rpcCall).mockImplementation((method: string) => {
        if (method === "project.list") return Promise.resolve({ projects: mockProjects });
        return Promise.resolve({ tasks: [], loops: [] });
      });

      render(<ProjectList collapsed={false} />);

      await waitFor(() => {
        expect(screen.getByText("ralph-orchestrator")).toBeInTheDocument();
      });

      expect(screen.queryByText(/\d+ tasks?/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\d+ loops?/)).not.toBeInTheDocument();
    });

    it("pluralizes correctly for single items", async () => {
      vi.mocked(rpcCall).mockImplementation((method: string, _params?: any, opts?: any) => {
        if (method === "project.list") return Promise.resolve({ projects: mockProjects });
        if (method === "task.list" && opts?.projectId === "proj-abc")
          return Promise.resolve({ tasks: [{ status: "open" }] });
        if (method === "loop.list" && opts?.projectId === "proj-abc")
          return Promise.resolve({ loops: [{ status: "running" }] });
        return Promise.resolve({ tasks: [], loops: [] });
      });

      render(<ProjectList collapsed={false} />);

      await waitFor(() => {
        expect(screen.getByText("1 task")).toBeInTheDocument();
        expect(screen.getByText("1 loop")).toBeInTheDocument();
      });
    });
  });
});
