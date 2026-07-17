import { describe, expect, it } from "vitest";
import { filterByPeriod, formatMeasurement, inferUnit, readWorkspaceLocation, workspaceUrl } from "@/lib/ui";

describe("workspace URL state", () => {
  it("round-trips view, dataset, and custom period", () => {
    const url = workspaceUrl("analysis", "dataset-1", { preset: "custom", from: "2026-01-02", to: "2026-02-03" });
    expect(url).toBe("/?view=analysis&dataset=dataset-1&range=custom&from=2026-01-02&to=2026-02-03");
    expect(readWorkspaceLocation(url.slice(1))).toEqual({
      view: "analysis",
      datasetId: "dataset-1",
      period: { preset: "custom", from: "2026-01-02", to: "2026-02-03" }
    });
  });

  it("rejects unknown workspace views", () => {
    expect(readWorkspaceLocation("?view=unknown").view).toBe("fleet");
  });
});

describe("measurement formatting", () => {
  it("infers common energy and operational units", () => {
    expect(inferUnit("energy_generated_mwh")).toBe("MWh");
    expect(inferUnit("peak_demand_mw")).toBe("MW");
    expect(inferUnit("availability_percentage")).toBe("%");
    expect(inferUnit("repair_hours")).toBe("h");
    expect(inferUnit("maintenance_cost")).toBe("currency");
  });

  it("formats currency and units consistently", () => {
    expect(formatMeasurement(1234.5, "MWh", "USD", 1)).toBe("1,234.5 MWh");
    expect(formatMeasurement(1200, "currency", "EUR", 0)).toContain("1,200");
    expect(formatMeasurement(null, "MW")).toBe("Not available");
  });
});

describe("dashboard periods", () => {
  const rows = [
    { date: "2024-01-01", value: 1 },
    { date: "2024-01-10", value: 2 },
    { date: "2024-01-30", value: 3 }
  ];

  it("anchors rolling periods to the latest dataset date", () => {
    expect(filterByPeriod(rows, (row) => row.date, { preset: "7d", from: "", to: "" })).toEqual([rows[2]]);
  });

  it("supports inclusive custom dates", () => {
    expect(filterByPeriod(rows, (row) => row.date, { preset: "custom", from: "2024-01-10", to: "2024-01-30" })).toEqual([rows[1], rows[2]]);
  });
});
