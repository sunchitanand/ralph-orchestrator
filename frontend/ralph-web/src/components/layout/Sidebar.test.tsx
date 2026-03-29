import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";

vi.mock("@/store", () => ({
  useUIStore: () => ({ sidebarOpen: true, toggleSidebar: vi.fn() }),
}));

vi.mock("@/rpc/client", () => ({
  rpcCall: vi.fn().mockResolvedValue({}),
}));

describe("Sidebar", () => {
  it("shows Loops nav item", () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getByText("Loops")).toBeInTheDocument();
  });
});
