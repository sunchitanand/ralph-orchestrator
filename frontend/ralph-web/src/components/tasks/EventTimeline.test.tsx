/**
 * EventTimeline Component Tests
 *
 * Tests for the vertical timeline rendering RalphEvent[] with
 * color-coded event types, expandable payload, and empty state.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventTimeline } from "./EventTimeline";
import type { RalphEvent } from "@/hooks/useTaskWebSocket";

const baseEvent = (overrides: Partial<RalphEvent> = {}): RalphEvent => ({
  ts: "2026-03-29T12:00:00Z",
  topic: "hat.activated",
  payload: { message: "hello" },
  ...overrides,
});

describe("EventTimeline", () => {
  it("renders empty state when no events", () => {
    render(<EventTimeline events={[]} />);
    expect(screen.getByText(/no events/i)).toBeInTheDocument();
  });

  it("renders event entries with topic, hat, iteration, and timestamp", () => {
    const events: RalphEvent[] = [
      baseEvent({ topic: "hat.activated", hat: "Builder", iteration: 3 }),
    ];
    render(<EventTimeline events={events} />);
    expect(screen.getByText("hat.activated")).toBeInTheDocument();
    expect(screen.getByText("Builder")).toBeInTheDocument();
    expect(screen.getByText("#3")).toBeInTheDocument();
  });

  it("expands payload on click", async () => {
    const user = userEvent.setup();
    const events: RalphEvent[] = [
      baseEvent({ payload: { gate: "tests", result: "pass" } }),
    ];
    render(<EventTimeline events={events} />);

    // Payload should not be visible initially
    expect(screen.queryByText(/"gate"/)).not.toBeInTheDocument();

    // Click the event row
    await user.click(screen.getByTestId("event-row-0"));

    // Full payload should now be visible
    expect(screen.getByText(/"gate"/)).toBeInTheDocument();
  });

  it("collapses payload on second click", async () => {
    const user = userEvent.setup();
    const events: RalphEvent[] = [
      baseEvent({ payload: { gate: "tests", result: "pass" } }),
    ];
    render(<EventTimeline events={events} />);

    await user.click(screen.getByTestId("event-row-0"));
    expect(screen.getByText(/"gate"/)).toBeInTheDocument();

    await user.click(screen.getByTestId("event-row-0"));
    expect(screen.queryByText(/"gate"/)).not.toBeInTheDocument();
  });

  it("highlights backpressure failure events in red", () => {
    const events: RalphEvent[] = [
      baseEvent({
        topic: "backpressure.fail",
        payload: { gate: "typecheck", error: "tsc failed" },
      }),
    ];
    render(<EventTimeline events={events} />);

    const row = screen.getByTestId("event-row-0");
    expect(row.className).toMatch(/red|destructive/);
  });

  it("highlights confession/reject events in red", () => {
    const events: RalphEvent[] = [
      baseEvent({
        topic: "confession",
        payload: { status: "rejected", gate: "lint" },
      }),
    ];
    render(<EventTimeline events={events} />);

    const row = screen.getByTestId("event-row-0");
    expect(row.className).toMatch(/red|destructive/);
  });

  it("highlights confession.done with rejected status in red", () => {
    const events: RalphEvent[] = [
      baseEvent({
        topic: "confession.done",
        payload: { status: "rejected", gate: "typecheck" },
      }),
    ];
    render(<EventTimeline events={events} />);

    const row = screen.getByTestId("event-row-0");
    expect(row.className).toMatch(/red|destructive/);
  });

  it("colors confession.done with passed status green, not red", () => {
    const events: RalphEvent[] = [
      baseEvent({
        topic: "confession.done",
        payload: { status: "passed" },
      }),
    ];
    render(<EventTimeline events={events} />);

    const row = screen.getByTestId("event-row-0");
    expect(row.className).not.toMatch(/red|destructive/);
    const badge = screen.getByText("confession.done");
    expect(badge.className).toMatch(/green/);
  });

  it("colors hat activation events blue", () => {
    const events: RalphEvent[] = [
      baseEvent({ topic: "hat.activated" }),
    ];
    render(<EventTimeline events={events} />);

    const badge = screen.getByText("hat.activated");
    expect(badge.className).toMatch(/blue/);
  });

  it("colors completion events green", () => {
    const events: RalphEvent[] = [
      baseEvent({ topic: "loop.complete" }),
    ];
    render(<EventTimeline events={events} />);

    const badge = screen.getByText("loop.complete");
    expect(badge.className).toMatch(/green/);
  });

  it("renders multiple events in order", () => {
    const events: RalphEvent[] = [
      baseEvent({ topic: "hat.activated", ts: "2026-03-29T12:00:00Z" }),
      baseEvent({ topic: "backpressure.pass", ts: "2026-03-29T12:01:00Z" }),
      baseEvent({ topic: "loop.complete", ts: "2026-03-29T12:02:00Z" }),
    ];
    render(<EventTimeline events={events} />);

    const rows = screen.getAllByTestId(/^event-row-/);
    expect(rows).toHaveLength(3);
  });

  it("shows payload preview text for string payloads", () => {
    const events: RalphEvent[] = [
      baseEvent({ payload: "short string payload" }),
    ];
    render(<EventTimeline events={events} />);
    expect(screen.getByText("short string payload")).toBeInTheDocument();
  });

  it("handles null payload gracefully", () => {
    const events: RalphEvent[] = [
      baseEvent({ payload: null }),
    ];
    render(<EventTimeline events={events} />);
    expect(screen.getByTestId("event-row-0")).toBeInTheDocument();
  });
});
