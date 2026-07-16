import { expect, Page, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const dataset = {
  id: "hybrid-1",
  original_filename: "hybrid-operations.csv",
  row_count: 120,
  column_count: 5,
  datetime_column: "timestamp",
  value_column: "generation_mwh",
  asset_column: "asset",
  dataset_type: "generation_and_demand",
  created_at: "2026-06-30T12:00:00Z"
};

async function mockApi(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("energy_analyst_access_token", "test-token"));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path.endsWith("/auth/me")) body = { id: "user-1", email: "analyst@example.com", full_name: "Test Analyst", role: "analyst", is_active: true, created_at: "2026-01-01" };
    else if (path.endsWith("/datasets")) body = [dataset];
    else if (path.endsWith("/kpis")) body = { metric_type: "generation_and_demand", value_column: "generation_mwh", datetime_column: "timestamp", total_output: 330, average_daily_output: 110, peak_output: 130, lowest_output: 90, capacity_factor: 62, average_efficiency: 88, downtime_hours: 2, downtime_basis: "status", missing_data_percentage: 1, best_performing_asset: null, underperforming_asset: null, asset_performance: [], peak_demand: 118, average_demand: 96, demand_variability: 8, load_factor: 81, maintenance_events: null, open_work_orders: null, average_repair_hours: null, maintenance_cost: null, availability_percentage: null };
    else if (path.endsWith("/summary")) body = { dataset, columns: ["timestamp", "generation_mwh", "demand_mw", "asset"], dtypes: { timestamp: "datetime64", generation_mwh: "float", demand_mw: "float", asset: "object" }, missing_values: {}, sample_rows: [], cleaning_report: { original_rows: 120, cleaned_rows: 120, columns_used_for_analysis: { datetime_column: "timestamp", value_column: "generation_mwh", demand_column: "demand_mw", asset_column: "asset" } } };
    else if (path.endsWith("/charts")) body = { time_series: [{ date: "2026-06-28", value: 90 }, { date: "2026-06-29", value: 110 }, { date: "2026-06-30", value: 130 }], asset_comparison: [{ asset: "Solar 1", value: 330 }], monthly_trend: [], weather_relationship: [] };
    else if (path.endsWith("/anomalies")) body = [];
    else if (path.endsWith("/forecast")) body = { horizon_days: 7, value_column: "generation_mwh", method: "moving_average", history: [{ date: "2026-06-30", value: 130 }], forecast: [{ date: "2026-07-01", predicted_value: 125, lower_bound: 115, upper_bound: 135 }], metrics: { mae: 2, rmse: 3 }, summary: "Stable generation outlook." };
    else if (path.endsWith("/demand")) body = { demand_column: "demand_mw", total_consumption: 288, peak_demand: 108, average_demand: 96, load_factor: 88, demand_variability: 7, peak_periods: [{ timestamp: "2026-06-30T12:00:00Z", demand: 108 }], daily_demand: [{ date: "2026-06-28", value: 85 }, { date: "2026-06-29", value: 95 }, { date: "2026-06-30", value: 108 }], forecast: { horizon_days: 7, value_column: "demand_mw", method: "moving_average", history: [{ date: "2026-06-30", value: 108 }], forecast: [{ date: "2026-07-01", predicted_value: 105, lower_bound: 98, upper_bound: 112 }], metrics: { mae: 2, rmse: 3 }, summary: "Stable demand outlook." } };
    else if (path.endsWith("/maintenance")) body = { maintenance_events: 0, open_work_orders: 0, closed_work_orders: 0, average_repair_hours: null, total_downtime_hours: 0, maintenance_cost: 0, availability_percentage: 100, events_by_type: [], asset_reliability: [] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

test.beforeEach(async ({ page }) => { await mockApi(page); });

test("supports bookmarkable analysis periods and combined operations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fleet Overview" })).toBeVisible();
  await page.getByRole("button", { name: "Analysis", exact: true }).click();
  await expect(page).toHaveURL(/view=analysis&dataset=hybrid-1/);
  await expect(page.getByText("Generation and demand balance")).toBeVisible();
  await page.getByLabel("Analysis period").selectOption("30d");
  await expect(page).toHaveURL(/range=30d/);
  await expect(page.getByRole("img", { name: /Generation and demand/ })).toBeVisible();
});

test("mobile fleet uses expandable rows without document overflow", async ({ page }) => {
  await page.goto("/");
  const row = page.getByRole("button", { name: "hybrid-operations.csv generation and demand | 330 MWh", exact: true });
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("list", { name: "Fleet dataset status" }).getByText("Primary KPI", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth)).toBe(true);
});

test("persists dark and compact display preferences", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open display preferences" }).click();
  await page.getByText("Dark", { exact: true }).click();
  await page.getByText("Compact", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("accessibility audit has no serious violations", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const fleetResults = await new AxeBuilder({ page }).analyze();
  expect(fleetResults.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
  await page.getByRole("button", { name: "Analysis", exact: true }).click();
  await expect(page.getByText("Generation and demand balance")).toBeVisible();
  const analysisResults = await new AxeBuilder({ page }).analyze();
  expect(analysisResults.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
});
