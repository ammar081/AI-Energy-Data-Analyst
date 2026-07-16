import { describe, expect, it } from "vitest";
import { filterFleetRows, FleetRow, paginateFleetRows, sortFleetRows } from "@/lib/fleet";

function row(name: string, type: FleetRow["dataset"]["dataset_type"], status: FleetRow["status"], missing: number, total: number): FleetRow {
  return {
    dataset: { id: name, original_filename: name, row_count: 10, column_count: 3, datetime_column: "date", value_column: "energy_mwh", asset_column: null, dataset_type: type, created_at: "2026-01-01" },
    status,
    kpis: {
      metric_type: type, value_column: "energy_mwh", datetime_column: "date", total_output: total, average_daily_output: null, peak_output: null, lowest_output: null, capacity_factor: null, average_efficiency: null, downtime_hours: 0, downtime_basis: "status", missing_data_percentage: missing, best_performing_asset: null, underperforming_asset: null, asset_performance: [], peak_demand: null, average_demand: null, demand_variability: null, load_factor: null, maintenance_events: null, open_work_orders: null, average_repair_hours: null, maintenance_cost: null, availability_percentage: null
    }
  };
}

const rows = [row("Solar East", "generation", "healthy", 1, 90), row("Grid Demand", "demand", "attention", 8, 70), row("Solar West", "generation", "unavailable", 3, 120)];

describe("fleet collection helpers", () => {
  it("combines text and domain filters", () => {
    expect(filterFleetRows(rows, "solar", "generation", "all").map((item) => item.dataset.original_filename)).toEqual(["Solar East", "Solar West"]);
  });

  it("sorts attention rows first and metrics descending", () => {
    expect(sortFleetRows(rows, "status")[0].status).toBe("attention");
    expect(sortFleetRows(rows, "metric")[0].dataset.original_filename).toBe("Solar West");
  });

  it("clamps page boundaries", () => {
    const result = paginateFleetRows(rows, 9, 2);
    expect(result.page).toBe(2);
    expect(result.rows).toHaveLength(1);
  });
});
