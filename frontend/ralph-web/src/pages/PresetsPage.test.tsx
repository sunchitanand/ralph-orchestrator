/**
 * PresetsPage Component Tests
 *
 * Tests for the presets listing page that displays hat collections
 * grouped by source (builtin, directory, collection).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PresetsPage } from "./PresetsPage";

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// Mock trpc
const mockImportYamlMutate = vi.fn();
vi.mock("@/trpc", () => ({
  trpc: {
    presets: {
      list: {
        useQuery: vi.fn(),
      },
      get: {
        useQuery: vi.fn(),
      },
    },
    collection: {
      importYaml: {
        useMutation: vi.fn(() => ({ mutate: mockImportYamlMutate, isPending: false })),
      },
    },
  },
}));

const mockPresets = [
  { id: "builtin:code-review", name: "code-review", source: "builtin", description: "Code review preset", path: "presets/code-review.yml" },
  { id: "builtin:tdd", name: "tdd", source: "builtin", description: "TDD preset", path: "presets/tdd.yml" },
  { id: "directory:my-hat", name: "my-hat", source: "directory", description: "Custom hat", path: ".ralph/hats/my-hat.yml" },
  { id: "collection:abc123", name: "My Collection", source: "collection", description: "A saved collection", path: null },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <PresetsPage />
    </MemoryRouter>
  );
}

describe("PresetsPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    mockImportYamlMutate.mockClear();
    const { trpc } = await import("@/trpc");
    // Default: no preset selected, so get returns idle state
    vi.mocked(trpc.presets.get.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as any);
  });

  it("renders page header", async () => {
    const { trpc } = await import("@/trpc");
    vi.mocked(trpc.presets.list.useQuery).mockReturnValue({
      data: mockPresets,
      isLoading: false,
      isError: false,
    } as any);

    renderPage();

    expect(screen.getByText("Presets")).toBeInTheDocument();
  });

  it("renders grouped preset cards by source", async () => {
    const { trpc } = await import("@/trpc");
    vi.mocked(trpc.presets.list.useQuery).mockReturnValue({
      data: mockPresets,
      isLoading: false,
      isError: false,
    } as any);

    renderPage();

    // Section headers for each source group
    expect(screen.getByText("Builtin")).toBeInTheDocument();
    expect(screen.getByText("Directory")).toBeInTheDocument();
    expect(screen.getByText("Collection")).toBeInTheDocument();

    // Preset names
    expect(screen.getByText("code-review")).toBeInTheDocument();
    expect(screen.getByText("tdd")).toBeInTheDocument();
    expect(screen.getByText("my-hat")).toBeInTheDocument();
    expect(screen.getByText("My Collection")).toBeInTheDocument();
  });

  it("renders source badges on cards", async () => {
    const { trpc } = await import("@/trpc");
    vi.mocked(trpc.presets.list.useQuery).mockReturnValue({
      data: [mockPresets[0]],
      isLoading: false,
      isError: false,
    } as any);

    renderPage();

    expect(screen.getByText("builtin")).toBeInTheDocument();
  });

  it("shows loading state", async () => {
    const { trpc } = await import("@/trpc");
    vi.mocked(trpc.presets.list.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any);

    renderPage();

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows error state with retry", async () => {
    const mockRefetch = vi.fn();
    const { trpc } = await import("@/trpc");
    vi.mocked(trpc.presets.list.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as any);

    renderPage();

    expect(screen.getByText(/error/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows empty state when no presets exist", async () => {
    const { trpc } = await import("@/trpc");
    vi.mocked(trpc.presets.list.useQuery).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as any);

    renderPage();

    expect(screen.getByText(/no presets/i)).toBeInTheDocument();
  });

  it("shows detail view with YAML content when a preset card is clicked", async () => {
    const yamlContent = "hats:\n  reviewer:\n    name: Reviewer\n";
    const { trpc } = await import("@/trpc");
    vi.mocked(trpc.presets.list.useQuery).mockReturnValue({
      data: mockPresets,
      isLoading: false,
      isError: false,
    } as any);
    vi.mocked(trpc.presets.get.useQuery).mockReturnValue({
      data: { yaml: yamlContent },
      isLoading: false,
      isError: false,
    } as any);

    renderPage();

    // Click the first preset card
    fireEvent.click(screen.getByText("code-review"));

    // Detail view should show metadata
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
    });

    // Detail view should show YAML content in a code block
    const codeBlock = screen.getByTestId("yaml-content");
    expect(codeBlock.textContent).toBe(yamlContent);
  });

  it("shows detail view metadata fields: name, description, source, category", async () => {
    const yamlContent = "hats:\n  test: true\n";
    const { trpc } = await import("@/trpc");
    vi.mocked(trpc.presets.list.useQuery).mockReturnValue({
      data: mockPresets,
      isLoading: false,
      isError: false,
    } as any);
    vi.mocked(trpc.presets.get.useQuery).mockReturnValue({
      data: { yaml: yamlContent },
      isLoading: false,
      isError: false,
    } as any);

    renderPage();

    fireEvent.click(screen.getByText("code-review"));

    // Should show source badge in detail view
    await waitFor(() => {
      expect(screen.getByTestId("detail-source")).toHaveTextContent("builtin");
    });
  });

  it("shows loading state while fetching YAML", async () => {
    const { trpc } = await import("@/trpc");
    vi.mocked(trpc.presets.list.useQuery).mockReturnValue({
      data: mockPresets,
      isLoading: false,
      isError: false,
    } as any);
    vi.mocked(trpc.presets.get.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any);

    renderPage();

    fireEvent.click(screen.getByText("code-review"));

    await waitFor(() => {
      expect(screen.getByText(/loading yaml/i)).toBeInTheDocument();
    });
  });

  it("shows 'Open in Builder' button for builtin presets in detail view", async () => {
    const yamlContent = "hats:\n  reviewer:\n    name: Reviewer\n";
    const { trpc } = await import("@/trpc");
    vi.mocked(trpc.presets.list.useQuery).mockReturnValue({
      data: mockPresets,
      isLoading: false,
      isError: false,
    } as any);
    vi.mocked(trpc.presets.get.useQuery).mockReturnValue({
      data: { yaml: yamlContent },
      isLoading: false,
      isError: false,
    } as any);

    renderPage();
    fireEvent.click(screen.getByText("code-review"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open in builder/i })).toBeInTheDocument();
    });
  });

  it("does not show 'Open in Builder' button for non-builtin presets", async () => {
    const yamlContent = "hats:\n  test: true\n";
    const { trpc } = await import("@/trpc");
    vi.mocked(trpc.presets.list.useQuery).mockReturnValue({
      data: mockPresets,
      isLoading: false,
      isError: false,
    } as any);
    vi.mocked(trpc.presets.get.useQuery).mockReturnValue({
      data: { yaml: yamlContent },
      isLoading: false,
      isError: false,
    } as any);

    renderPage();
    // Click a directory preset (non-builtin)
    fireEvent.click(screen.getByText("my-hat"));

    await waitFor(() => {
      expect(screen.getByTestId("yaml-content")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /open in builder/i })).not.toBeInTheDocument();
  });

  it("calls collection.importYaml and navigates to /builder on 'Open in Builder' click", async () => {
    const yamlContent = "hats:\n  reviewer:\n    name: Reviewer\n";
    const { trpc } = await import("@/trpc");
    vi.mocked(trpc.presets.list.useQuery).mockReturnValue({
      data: mockPresets,
      isLoading: false,
      isError: false,
    } as any);
    vi.mocked(trpc.presets.get.useQuery).mockReturnValue({
      data: { yaml: yamlContent },
      isLoading: false,
      isError: false,
    } as any);
    // Make mutate call onSuccess synchronously
    mockImportYamlMutate.mockImplementation((_args: any, opts: any) => {
      opts?.onSuccess?.();
    });

    renderPage();
    fireEvent.click(screen.getByText("code-review"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open in builder/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /open in builder/i }));

    expect(mockImportYamlMutate).toHaveBeenCalledWith(
      { yaml: yamlContent, name: "code-review" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/builder");
  });

  it("allows closing the detail view", async () => {
    const yamlContent = "hats:\n  test: true\n";
    const { trpc } = await import("@/trpc");
    vi.mocked(trpc.presets.list.useQuery).mockReturnValue({
      data: mockPresets,
      isLoading: false,
      isError: false,
    } as any);
    vi.mocked(trpc.presets.get.useQuery).mockReturnValue({
      data: { yaml: yamlContent },
      isLoading: false,
      isError: false,
    } as any);

    renderPage();

    fireEvent.click(screen.getByText("code-review"));

    await waitFor(() => {
      expect(screen.getByTestId("yaml-content")).toBeInTheDocument();
    });

    // Close the detail view
    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("yaml-content")).not.toBeInTheDocument();
    });
  });
});
