/**
 * FolderPicker Component Tests
 *
 * Tests for the folder picker dialog that lets users browse directories
 * and add projects via project.browse and project.add RPC calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/rpc/client", () => ({
  rpcCall: vi.fn(),
}));

import { FolderPicker } from "./FolderPicker";
import { rpcCall } from "@/rpc/client";

const mockBrowseResult = {
  entries: [
    { name: "project-a", path: "/home/user/project-a", isDirectory: true, hasRalphYml: true },
    { name: "project-b", path: "/home/user/project-b", isDirectory: true, hasRalphYml: false },
    { name: "file.txt", path: "/home/user/file.txt", isDirectory: false, hasRalphYml: false },
  ],
};

const mockNestedBrowse = {
  entries: [
    { name: "src", path: "/home/user/project-a/src", isDirectory: true, hasRalphYml: false },
  ],
};

describe("FolderPicker", () => {
  const onClose = vi.fn();
  const onProjectAdded = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rpcCall).mockResolvedValue(mockBrowseResult);
  });

  // AC1: renders as a modal/dialog overlay
  it("renders as a modal overlay when open", () => {
    render(<FolderPicker open={true} onClose={onClose} onProjectAdded={onProjectAdded} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Add Project")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<FolderPicker open={false} onClose={onClose} onProjectAdded={onProjectAdded} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // AC2: typing a path and clicking Browse calls project.browse
  it("calls project.browse when Browse is clicked", async () => {
    const user = userEvent.setup();
    render(<FolderPicker open={true} onClose={onClose} onProjectAdded={onProjectAdded} />);

    const input = screen.getByPlaceholderText("/path/to/project");
    await user.clear(input);
    await user.type(input, "/home/user");
    await user.click(screen.getByRole("button", { name: "Browse" }));

    expect(rpcCall).toHaveBeenCalledWith("project.browse", { path: "/home/user" });
    await waitFor(() => {
      expect(screen.getByText("project-a")).toBeInTheDocument();
      expect(screen.getByText("project-b")).toBeInTheDocument();
    });
  });

  // AC3: clicking a directory entry navigates into it
  it("navigates into a directory on click", async () => {
    const user = userEvent.setup();
    vi.mocked(rpcCall)
      .mockResolvedValueOnce(mockBrowseResult)
      .mockResolvedValueOnce(mockNestedBrowse);

    render(<FolderPicker open={true} onClose={onClose} onProjectAdded={onProjectAdded} />);

    const input = screen.getByPlaceholderText("/path/to/project");
    await user.clear(input);
    await user.type(input, "/home/user");
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => expect(screen.getByText("project-a")).toBeInTheDocument());
    await user.click(screen.getByText("project-a"));

    expect(rpcCall).toHaveBeenCalledWith("project.browse", { path: "/home/user/project-a" });
    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });
  });

  // AC4: entries with hasRalphYml show a badge
  it("shows ralph badge for directories with ralph.yml", async () => {
    const user = userEvent.setup();
    render(<FolderPicker open={true} onClose={onClose} onProjectAdded={onProjectAdded} />);

    const input = screen.getByPlaceholderText("/path/to/project");
    await user.clear(input);
    await user.type(input, "/home/user");
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByText("project-a")).toBeInTheDocument();
    });
    // The ralph badge should appear for project-a (hasRalphYml: true)
    expect(screen.getByText("ralph")).toBeInTheDocument();
  });

  // AC5: clicking Add calls project.add, closes dialog, refreshes
  it("adds project and closes dialog on Add click", async () => {
    const user = userEvent.setup();
    vi.mocked(rpcCall)
      .mockResolvedValueOnce(mockBrowseResult) // browse
      .mockResolvedValueOnce({ success: true }); // add

    render(<FolderPicker open={true} onClose={onClose} onProjectAdded={onProjectAdded} />);

    const input = screen.getByPlaceholderText("/path/to/project");
    await user.clear(input);
    await user.type(input, "/home/user");
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => expect(screen.getByText("project-a")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^Add$/ }));

    await waitFor(() => {
      expect(rpcCall).toHaveBeenCalledWith("project.add", { path: "/home/user" }, { mutating: true });
    });
    expect(onProjectAdded).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  // AC6: cancel closes dialog without side effects
  it("closes dialog on Cancel without calling project.add", async () => {
    const user = userEvent.setup();
    render(<FolderPicker open={true} onClose={onClose} onProjectAdded={onProjectAdded} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(rpcCall).not.toHaveBeenCalledWith("project.add", expect.anything(), expect.anything());
    expect(onProjectAdded).not.toHaveBeenCalled();
  });

  // AC3 continued: only directories are clickable for navigation
  it("does not show non-directory entries as navigable", async () => {
    const user = userEvent.setup();
    render(<FolderPicker open={true} onClose={onClose} onProjectAdded={onProjectAdded} />);

    const input = screen.getByPlaceholderText("/path/to/project");
    await user.clear(input);
    await user.type(input, "/home/user");
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => expect(screen.getByText("project-a")).toBeInTheDocument());
    // file.txt should not appear (non-directory entries filtered)
    expect(screen.queryByText("file.txt")).not.toBeInTheDocument();
  });
});
