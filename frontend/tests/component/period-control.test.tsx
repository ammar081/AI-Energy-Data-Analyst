import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardPeriodControl } from "@/components/DashboardPeriodControl";

describe("DashboardPeriodControl", () => {
  it("switches to a custom range", () => {
    const change = vi.fn();
    const { rerender } = render(<DashboardPeriodControl onChange={change} period={{ preset: "all", from: "", to: "" }} />);
    fireEvent.change(screen.getByLabelText("Analysis period"), { target: { value: "custom" } });
    expect(change).toHaveBeenCalledWith({ preset: "custom", from: "", to: "" });
    rerender(<DashboardPeriodControl onChange={change} period={{ preset: "custom", from: "", to: "" }} />);
    expect(screen.getByText("From")).toBeVisible();
    expect(screen.getByText("To")).toBeVisible();
  });
});
