import { Dataset, KPIResponse } from "@/lib/api";

export type FleetStatus = "healthy" | "attention" | "unavailable";
export type FleetSort = "newest" | "name" | "status" | "quality" | "metric";
export type FleetDomain = "all" | Dataset["dataset_type"];

export type FleetRow = {
  dataset: Dataset;
  kpis: KPIResponse | null;
  status: FleetStatus;
};

export function fleetStatus(kpis: KPIResponse | null): FleetStatus {
  if (!kpis) return "unavailable";
  if ((kpis.open_work_orders ?? 0) > 0 || kpis.missing_data_percentage > 5 || (kpis.downtime_hours ?? 0) > 12) return "attention";
  return "healthy";
}

export function fleetPrimaryValue(row: FleetRow) {
  if (!row.kpis) return null;
  if (row.dataset.dataset_type === "maintenance") return row.kpis.availability_percentage;
  if (row.dataset.dataset_type === "demand") return row.kpis.peak_demand;
  return row.kpis.total_output;
}

export function filterFleetRows(rows: FleetRow[], query: string, domain: FleetDomain, status: "all" | FleetStatus) {
  const normalizedQuery = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (domain !== "all" && row.dataset.dataset_type !== domain) return false;
    if (status !== "all" && row.status !== status) return false;
    if (!normalizedQuery) return true;
    return [row.dataset.original_filename, row.dataset.dataset_type, row.dataset.value_column, row.dataset.asset_column]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  });
}

export function sortFleetRows(rows: FleetRow[], sort: FleetSort) {
  const next = [...rows];
  const statusOrder: Record<FleetStatus, number> = { attention: 0, unavailable: 1, healthy: 2 };
  next.sort((left, right) => {
    if (sort === "name") return left.dataset.original_filename.localeCompare(right.dataset.original_filename);
    if (sort === "status") return statusOrder[left.status] - statusOrder[right.status] || left.dataset.original_filename.localeCompare(right.dataset.original_filename);
    if (sort === "quality") return (right.kpis?.missing_data_percentage ?? -1) - (left.kpis?.missing_data_percentage ?? -1);
    if (sort === "metric") return (fleetPrimaryValue(right) ?? -Infinity) - (fleetPrimaryValue(left) ?? -Infinity);
    return new Date(right.dataset.created_at ?? 0).getTime() - new Date(left.dataset.created_at ?? 0).getTime();
  });
  return next;
}

export function paginateFleetRows(rows: FleetRow[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  return { page: safePage, pageCount, rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize) };
}
