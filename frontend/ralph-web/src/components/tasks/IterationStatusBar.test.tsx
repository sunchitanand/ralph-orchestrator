/**
 * IterationStatusBar Component Tests
 *
 * Tests for the status bar showing iteration number, hat badge,
 * elapsed time, and progress toward max_iterations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { IterationStatusBar } from "./IterationStatusBar";

describe("IterationStatusBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders iteration counter with max when maxIterations provided", () => {
    render(
      <IterationStatusBar
        iteration={3}
        maxIterations={10}
        hatName="Builder"
        startedAt={new Date().toISOString()}
      />
    );
    expect(screen.getByText("Iteration 3 / 10")).toBeInTheDocument();
  });

  it("renders iteration counter without max when maxIterations is null", () => {
    render(
      <IterationStatusBar
        iteration={5}
        maxIterations={null}
        hatName="Builder"
        startedAt={new Date().toISOString()}
      />
    );
    expect(screen.getByText("Iteration 5")).toBeInTheDocument();
  });

  it("renders hat name badge", () => {
    render(
      <IterationStatusBar
        iteration={1}
        maxIterations={null}
        hatName="Critic"
        startedAt={new Date().toISOString()}
      />
    );
    expect(screen.getByText("Critic")).toBeInTheDocument();
  });

  it("does not render hat badge when hatName is null", () => {
    render(
      <IterationStatusBar
        iteration={1}
        maxIterations={null}
        hatName={null}
        startedAt={new Date().toISOString()}
      />
    );
    expect(screen.queryByTestId("hat-badge")).not.toBeInTheDocument();
  });

  it("renders progress bar when maxIterations provided", () => {
    render(
      <IterationStatusBar
        iteration={3}
        maxIterations={10}
        hatName={null}
        startedAt={new Date().toISOString()}
      />
    );
    const progressBar = screen.getByRole("progressbar");
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute("aria-valuenow", "3");
    expect(progressBar).toHaveAttribute("aria-valuemax", "10");
  });

  it("does not render progress bar when maxIterations is null", () => {
    render(
      <IterationStatusBar
        iteration={3}
        maxIterations={null}
        hatName={null}
        startedAt={new Date().toISOString()}
      />
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("renders elapsed time in MM:SS format", () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    render(
      <IterationStatusBar
        iteration={1}
        maxIterations={null}
        hatName={null}
        startedAt={twoMinutesAgo}
      />
    );
    expect(screen.getByText("02:00")).toBeInTheDocument();
  });

  it("elapsed time ticks live every second", () => {
    const now = new Date();
    render(
      <IterationStatusBar
        iteration={1}
        maxIterations={null}
        hatName={null}
        startedAt={now.toISOString()}
      />
    );
    expect(screen.getByText("00:00")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("00:05")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(55000);
    });
    expect(screen.getByText("01:00")).toBeInTheDocument();
  });

  it("does not render elapsed time when startedAt is null", () => {
    render(
      <IterationStatusBar
        iteration={1}
        maxIterations={null}
        hatName={null}
        startedAt={null}
      />
    );
    expect(screen.queryByTestId("elapsed-time")).not.toBeInTheDocument();
  });

  it("has data-testid for test targeting", () => {
    render(
      <IterationStatusBar
        iteration={1}
        maxIterations={null}
        hatName={null}
        startedAt={null}
      />
    );
    expect(screen.getByTestId("iteration-status-bar")).toBeInTheDocument();
  });
});
