import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, ProgressState, SuccessState } from "@/components/FeedbackStates";

describe("feedback states", () => {
  it("renders actionable empty and error states", () => {
    const retry = vi.fn();
    const { rerender } = render(<EmptyState action={<button type="button">Upload</button>} detail="Add data" title="No data" />);
    expect(screen.getByText("No data")).toBeVisible();
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
    rerender(<ErrorState message="Network unavailable" onRetry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("announces progress and success", () => {
    const { rerender } = render(<ProgressState detail="Please wait" title="Loading" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    rerender(<SuccessState title="Saved" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });
});
