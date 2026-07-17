export const workspaceViews = ["fleet", "analysis", "quality", "compare", "reports", "live", "admin"] as const;

export type WorkspaceView = (typeof workspaceViews)[number];
export type PeriodPreset = "all" | "7d" | "30d" | "90d" | "custom";
export type ThemePreference = "system" | "light" | "dark";
export type DensityPreference = "comfortable" | "compact";
export type CurrencyPreference = "USD" | "EUR" | "GBP";

export type DashboardPeriod = {
  preset: PeriodPreset;
  from: string;
  to: string;
};

export type UserPreferences = {
  theme: ThemePreference;
  density: DensityPreference;
  fleetPageSize: number;
  currency: CurrencyPreference;
  defaultPeriod: Exclude<PeriodPreset, "custom">;
};

export const defaultPreferences: UserPreferences = {
  theme: "system",
  density: "comfortable",
  fleetPageSize: 10,
  currency: "USD",
  defaultPeriod: "all"
};

export const defaultPeriod: DashboardPeriod = { preset: "all", from: "", to: "" };

const PREFERENCES_KEY = "energy_analyst_preferences";

export function loadPreferences(): UserPreferences {
  if (typeof window === "undefined") return defaultPreferences;
  try {
    const stored = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? "{}") as Partial<UserPreferences>;
    return {
      theme: ["system", "light", "dark"].includes(stored.theme ?? "") ? stored.theme as ThemePreference : defaultPreferences.theme,
      density: ["comfortable", "compact"].includes(stored.density ?? "") ? stored.density as DensityPreference : defaultPreferences.density,
      fleetPageSize: [5, 10, 20].includes(stored.fleetPageSize ?? 0) ? stored.fleetPageSize as number : defaultPreferences.fleetPageSize,
      currency: ["USD", "EUR", "GBP"].includes(stored.currency ?? "") ? stored.currency as CurrencyPreference : defaultPreferences.currency,
      defaultPeriod: ["all", "7d", "30d", "90d"].includes(stored.defaultPeriod ?? "") ? stored.defaultPeriod as UserPreferences["defaultPeriod"] : defaultPreferences.defaultPeriod
    };
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(preferences: UserPreferences) {
  window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

export function resolveTheme(theme: ThemePreference, prefersDark: boolean): "light" | "dark" {
  return theme === "system" ? (prefersDark ? "dark" : "light") : theme;
}

export function readWorkspaceLocation(search: string): { view: WorkspaceView; datasetId: string; period: DashboardPeriod } {
  const params = new URLSearchParams(search);
  const requestedView = params.get("view");
  const view = workspaceViews.includes(requestedView as WorkspaceView) ? requestedView as WorkspaceView : "fleet";
  const requestedPreset = params.get("range");
  const preset = ["all", "7d", "30d", "90d", "custom"].includes(requestedPreset ?? "") ? requestedPreset as PeriodPreset : "all";
  return {
    view,
    datasetId: params.get("dataset") ?? "",
    period: {
      preset,
      from: preset === "custom" ? params.get("from") ?? "" : "",
      to: preset === "custom" ? params.get("to") ?? "" : ""
    }
  };
}

export function workspaceUrl(view: WorkspaceView, datasetId: string, period: DashboardPeriod) {
  const params = new URLSearchParams();
  if (view !== "fleet") params.set("view", view);
  if (datasetId && ["analysis", "quality", "reports", "live"].includes(view)) params.set("dataset", datasetId);
  if (view === "analysis" && period.preset !== "all") {
    params.set("range", period.preset);
    if (period.preset === "custom") {
      if (period.from) params.set("from", period.from);
      if (period.to) params.set("to", period.to);
    }
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function periodBounds(period: DashboardPeriod, availableDates: Array<string | null | undefined>) {
  const validDates = availableDates.map(validDate).filter((date): date is Date => Boolean(date));
  const latest = validDates.length ? new Date(Math.max(...validDates.map((date) => date.getTime()))) : null;
  if (period.preset === "all") return { from: null, to: null };
  if (period.preset === "custom") return { from: validDate(period.from), to: validDate(period.to ? `${period.to}T23:59:59.999` : null) };
  if (!latest) return { from: null, to: null };
  const days = Number.parseInt(period.preset, 10);
  const from = new Date(latest);
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);
  return { from, to: latest };
}

export function filterByPeriod<T>(rows: T[], getDate: (row: T) => string | null | undefined, period: DashboardPeriod, availableDates?: Array<string | null | undefined>) {
  const dates = availableDates ?? rows.map(getDate);
  const bounds = periodBounds(period, dates);
  if (!bounds.from && !bounds.to) return rows;
  return rows.filter((row) => {
    const date = validDate(getDate(row));
    if (!date) return false;
    if (bounds.from && date < bounds.from) return false;
    if (bounds.to && date > bounds.to) return false;
    return true;
  });
}

export function periodLabel(period: DashboardPeriod) {
  if (period.preset === "all") return "All available data";
  if (period.preset !== "custom") return `Latest ${period.preset.replace("d", " days")}`;
  if (period.from && period.to) return `${period.from} to ${period.to}`;
  if (period.from) return `From ${period.from}`;
  if (period.to) return `Through ${period.to}`;
  return "Custom period";
}

export type MeasurementUnit = "MWh" | "MW" | "kWh" | "kW" | "GWh" | "GW" | "%" | "h" | "currency" | "count" | "none";

export function inferUnit(column: string | null | undefined, fallback: MeasurementUnit = "none"): MeasurementUnit {
  const name = (column ?? "").toLowerCase().replace(/[^a-z0-9%]+/g, "_");
  if (name.includes("percent") || name.includes("percentage") || name.includes("efficiency") || name.includes("factor") || name.includes("availability") || name.includes("%")) return "%";
  if (name.includes("downtime") || name.includes("duration") || name.includes("repair_hour") || name.endsWith("_hours") || name.endsWith("_hour")) return "h";
  if (name.includes("cost") || name.includes("price") || name.includes("expense")) return "currency";
  if (name.includes("gwh")) return "GWh";
  if (name.includes("mwh")) return "MWh";
  if (name.includes("kwh")) return "kWh";
  if (name.includes("gw") && (name.includes("power") || name.includes("demand") || name.includes("capacity"))) return "GW";
  if (name.includes("mw") && (name.includes("power") || name.includes("demand") || name.includes("capacity"))) return "MW";
  if (name.includes("kw") && (name.includes("power") || name.includes("demand") || name.includes("capacity"))) return "kW";
  if (name.includes("demand") || name.includes("load") || name.includes("power")) return "MW";
  if (name.includes("energy") || name.includes("generation") || name.includes("output") || name.includes("consumption")) return "MWh";
  return fallback;
}

export function formatMeasurement(
  value: number | null | undefined,
  unit: MeasurementUnit = "none",
  currency: CurrencyPreference = "USD",
  maximumFractionDigits = 2
) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not available";
  if (unit === "currency") {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits }).format(value);
  }
  const formatted = new Intl.NumberFormat("en", { maximumFractionDigits }).format(value);
  if (unit === "none" || unit === "count") return formatted;
  return unit === "%" ? `${formatted}%` : `${formatted} ${unit}`;
}

export function numericSummary(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value !== null && value !== undefined && !Number.isNaN(value));
  if (!valid.length) return { total: null, average: null, peak: null, minimum: null, variability: null };
  const total = valid.reduce((sum, value) => sum + value, 0);
  const average = total / valid.length;
  const variance = valid.reduce((sum, value) => sum + (value - average) ** 2, 0) / valid.length;
  return {
    total,
    average,
    peak: Math.max(...valid),
    minimum: Math.min(...valid),
    variability: average === 0 ? null : Math.sqrt(variance) / Math.abs(average) * 100
  };
}
