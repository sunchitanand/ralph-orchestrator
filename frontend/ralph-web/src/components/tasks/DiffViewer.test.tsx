/**
 * DiffViewer Component Tests
 *
 * Tests for the file list with expandable diffs.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiffViewer } from "./DiffViewer";

const mockFiles = [
  {
    path: "src/main.rs",
    status: "modified",
    additions: 10,
    deletions: 3,
    diff: `@@ -1,5 +1,12 @@
 use std::io;
+use std::fs;
 
 fn main() {
-    println!("old");
+    println!("new");
+    println!("added");
 }`,
  },
  {
    path: "src/lib.rs",
    status: "added",
    additions: 5,
    deletions: 0,
    diff: `@@ -0,0 +1,5 @@
+pub fn hello() {
+    println!("hello");
+}`,
  },
  {
    path: "src/old.rs",
    status: "deleted",
    additions: 0,
    deletions: 8,
    diff: `@@ -1,8 +0,0 @@
-pub fn old() {
-    println!("removed");
-}`,
  },
];

describe("DiffViewer", () => {
  it("renders file list with paths and stats", () => {
    render(<DiffViewer files={mockFiles} />);

    expect(screen.getByText("src/main.rs")).toBeInTheDocument();
    expect(screen.getByText("src/lib.rs")).toBeInTheDocument();
    expect(screen.getByText("src/old.rs")).toBeInTheDocument();
    expect(screen.getByText("+10")).toBeInTheDocument();
    expect(screen.getByText("-3")).toBeInTheDocument();
  });

  it("expands diff on filename click", async () => {
    const user = userEvent.setup();
    render(<DiffViewer files={mockFiles} />);

    // Diff not visible initially
    expect(screen.queryByText(/println!\("new"\)/)).not.toBeInTheDocument();

    // Click filename
    await user.click(screen.getByText("src/main.rs"));

    // Diff should now be visible
    expect(screen.getByText(/println!\("new"\)/)).toBeInTheDocument();
  });

  it("collapses diff on second click", async () => {
    const user = userEvent.setup();
    render(<DiffViewer files={mockFiles} />);

    await user.click(screen.getByText("src/main.rs"));
    expect(screen.getByText(/println!\("new"\)/)).toBeInTheDocument();

    await user.click(screen.getByText("src/main.rs"));
    expect(screen.queryByText(/println!\("new"\)/)).not.toBeInTheDocument();
  });

  it("renders empty state when no files", () => {
    render(<DiffViewer files={[]} />);
    expect(screen.getByText(/no changes/i)).toBeInTheDocument();
  });

  it("colors addition lines green and deletion lines red", async () => {
    const user = userEvent.setup();
    render(<DiffViewer files={mockFiles} />);

    await user.click(screen.getByText("src/main.rs"));

    const diffBlock = screen.getByTestId("diff-content-0");
    // Addition lines should have green styling
    const additionLines = diffBlock.querySelectorAll("[data-diff-type='addition']");
    expect(additionLines.length).toBeGreaterThan(0);
    // Deletion lines should have red styling
    const deletionLines = diffBlock.querySelectorAll("[data-diff-type='deletion']");
    expect(deletionLines.length).toBeGreaterThan(0);
  });

  it("shows file status badge", () => {
    render(<DiffViewer files={mockFiles} />);
    expect(screen.getByText("modified")).toBeInTheDocument();
    expect(screen.getByText("added")).toBeInTheDocument();
    expect(screen.getByText("deleted")).toBeInTheDocument();
  });
});
