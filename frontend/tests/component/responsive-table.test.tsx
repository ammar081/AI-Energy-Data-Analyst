import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResponsiveTable } from "@/components/ResponsiveTable";

describe("ResponsiveTable", () => {
  it("exposes mobile row details through an accessible disclosure", () => {
    render(<ResponsiveTable caption="Assets" columns={[{ key: "asset", label: "Asset", render: (row: { id: string; value: number }) => row.id }, { key: "value", label: "Value", render: (row) => row.value }]} mobileSummary={(row) => `${row.value} MW`} mobileTitle={(row) => row.id} rowKey={(row) => row.id} rows={[{ id: "Turbine 1", value: 42 }]} />);
    const toggle = screen.getByRole("button", { name: /Turbine 1/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Value", { selector: "dt" })).toBeVisible();
  });
});
