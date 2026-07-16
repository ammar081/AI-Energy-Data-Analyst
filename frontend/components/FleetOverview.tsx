"use client";

import { ArrowRight, ChevronLeft, ChevronRight, Database, HardHat, Loader2, Search, Trash2, UploadCloud, Wind } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, FleetSkeleton } from "@/components/FeedbackStates";
import { ResponsiveColumn, ResponsiveTable } from "@/components/ResponsiveTable";
import { api, Dataset, User } from "@/lib/api";
import { filterFleetRows, FleetDomain, FleetRow, FleetSort, fleetPrimaryValue, fleetStatus, paginateFleetRows, sortFleetRows } from "@/lib/fleet";
import { CurrencyPreference, formatMeasurement, inferUnit, MeasurementUnit } from "@/lib/ui";

function primaryMetric(row: FleetRow, currency: CurrencyPreference) {
  if (!row.kpis) return { label: "Metric", value: "Not available" };
  if (row.dataset.dataset_type === "maintenance") return { label: "Availability", value: formatMeasurement(row.kpis.availability_percentage, "%", currency, 1) };
  if (row.dataset.dataset_type === "demand") return { label: "Peak demand", value: formatMeasurement(row.kpis.peak_demand, inferUnit(row.kpis.value_column, "MW"), currency, 1) };
  return { label: "Total output", value: formatMeasurement(row.kpis.total_output, inferUnit(row.kpis.value_column, "MWh"), currency, 1) };
}

export function FleetOverview({
  datasets,
  user,
  onOpenDataset,
  onDeleteDataset,
  onUpload,
  isUploading,
  pageSize,
  currency
}: {
  datasets: Dataset[];
  user: User;
  onOpenDataset: (id: string) => void;
  onDeleteDataset: (dataset: Dataset) => void;
  onUpload: () => void;
  isUploading: boolean;
  pageSize: number;
  currency: CurrencyPreference;
}) {
  const [rows, setRows] = useState<FleetRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<FleetDomain>("all");
  const [status, setStatus] = useState<"all" | FleetRow["status"]>("all");
  const [sort, setSort] = useState<FleetSort>("newest");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    if (!datasets.length) {
      setRows([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError("");
    Promise.allSettled(datasets.map((dataset) => api.kpis(dataset.id)))
      .then((results) => {
        if (!active) return;
        const next = datasets.map((dataset, index) => {
          const result = results[index];
          const kpis = result.status === "fulfilled" ? result.value : null;
          return { dataset, kpis, status: fleetStatus(kpis) };
        });
        setRows(next);
        if (next.every((row) => !row.kpis)) setError("Fleet metrics could not be loaded from the API.");
      })
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, [datasets, reloadKey]);

  useEffect(() => setPage(1), [domain, pageSize, query, sort, status]);

  const totals = useMemo(() => {
    const generationRows = rows.filter((row) => row.dataset.dataset_type !== "demand" && row.dataset.dataset_type !== "maintenance");
    const efficiencies = rows.map((row) => row.kpis?.average_efficiency).filter((value): value is number => value !== null && value !== undefined);
    const generationUnits = new Set(generationRows.map((row) => inferUnit(row.kpis?.value_column, "MWh")));
    return {
      output: generationRows.reduce((sum, row) => sum + (row.kpis?.total_output ?? 0), 0),
      outputUnit: generationUnits.size === 1 ? Array.from(generationUnits)[0] : "none" as MeasurementUnit,
      efficiency: efficiencies.length ? efficiencies.reduce((sum, value) => sum + value, 0) / efficiencies.length : null,
      workOrders: rows.reduce((sum, row) => sum + (row.kpis?.open_work_orders ?? 0), 0),
      attention: rows.filter((row) => row.status === "attention").length
    };
  }, [rows]);

  const mix = useMemo(() => {
    const counts = new Map<string, number>();
    datasets.forEach((dataset) => counts.set(dataset.dataset_type, (counts.get(dataset.dataset_type) ?? 0) + 1));
    return Array.from(counts, ([type, count]) => ({ type, count, share: datasets.length ? count / datasets.length * 100 : 0 }));
  }, [datasets]);

  const filtered = useMemo(() => sortFleetRows(filterFleetRows(rows, query, domain, status), sort), [domain, query, rows, sort, status]);
  const paginated = useMemo(() => paginateFleetRows(filtered, page, pageSize), [filtered, page, pageSize]);

  const columns: ResponsiveColumn<FleetRow>[] = [
    { key: "dataset", label: "Dataset", hideFromDetails: true, render: (row) => <button className="table-link" onClick={() => onOpenDataset(row.dataset.id)} type="button"><strong>{row.dataset.original_filename}</strong><small>{row.dataset.row_count.toLocaleString()} rows</small></button> },
    { key: "domain", label: "Domain", render: (row) => <span className={`domain-label ${row.dataset.dataset_type}`}>{row.dataset.dataset_type.replaceAll("_", " ")}</span> },
    { key: "metric", label: "Primary KPI", render: (row) => { const metric = primaryMetric(row, currency); return <><strong>{metric.value}</strong><small className="table-value">{metric.label}</small></>; } },
    { key: "quality", label: "Data quality", render: (row) => formatMeasurement(row.kpis?.missing_data_percentage, "%", currency, 1) },
    { key: "status", label: "Status", render: (row) => <span className={`fleet-status ${row.status}`}>{row.status}</span> },
    { key: "actions", label: "Actions", render: (row) => <div className="row-actions"><button aria-label={`Open ${row.dataset.original_filename}`} className="row-action" onClick={() => onOpenDataset(row.dataset.id)} title="Open analysis" type="button"><ArrowRight aria-hidden="true" size={17} /></button>{user.role === "admin" ? <button aria-label={`Delete ${row.dataset.original_filename}`} className="row-action danger" onClick={() => onDeleteDataset(row.dataset)} title="Delete dataset" type="button"><Trash2 aria-hidden="true" size={16} /></button> : null}</div> }
  ];

  if (isLoading) return <FleetSkeleton />;
  if (!datasets.length) return <EmptyState icon={<Database size={25} />} title="No operational data yet" detail="Upload generation, demand, or maintenance data to start the fleet workspace." action={user.role !== "viewer" ? <button className="primary-command compact" disabled={isUploading} onClick={onUpload} type="button">{isUploading ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}Upload dataset</button> : null} />;
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey((value) => value + 1)} />;

  return (
    <section className="fleet-overview" aria-label="Fleet operations overview">
      <div className="fleet-summary" aria-label="Fleet summary metrics">
        <div><span>Portfolio output</span><strong>{formatMeasurement(totals.output, totals.outputUnit, currency, 1)}</strong><small>{totals.outputUnit === "none" ? "Mixed measurement units" : "Generation datasets"}</small></div>
        <div><span>Average efficiency</span><strong>{formatMeasurement(totals.efficiency, "%", currency, 1)}</strong><small>Available efficiency readings</small></div>
        <div><span>Open work orders</span><strong>{formatMeasurement(totals.workOrders, "count", currency, 0)}</strong><small>Maintenance backlog</small></div>
        <div className={totals.attention ? "attention" : "healthy"}><span>Needs attention</span><strong>{totals.attention}</strong><small>{datasets.length} datasets monitored</small></div>
      </div>

      <div className="fleet-controls" role="search">
        <label className="fleet-search"><Search aria-hidden="true" size={17} /><span className="sr-only">Search fleet datasets</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search datasets" type="search" value={query} /></label>
        <label><span className="sr-only">Filter by domain</span><select aria-label="Filter by domain" onChange={(event) => setDomain(event.target.value as FleetDomain)} value={domain}><option value="all">All domains</option><option value="generation">Generation</option><option value="demand">Demand</option><option value="generation_and_demand">Generation and demand</option><option value="maintenance">Maintenance</option></select></label>
        <label><span className="sr-only">Filter by status</span><select aria-label="Filter by status" onChange={(event) => setStatus(event.target.value as typeof status)} value={status}><option value="all">All statuses</option><option value="attention">Needs attention</option><option value="healthy">Healthy</option><option value="unavailable">Unavailable</option></select></label>
        <label><span className="sr-only">Sort fleet datasets</span><select aria-label="Sort fleet datasets" onChange={(event) => setSort(event.target.value as FleetSort)} value={sort}><option value="newest">Newest first</option><option value="name">Name</option><option value="status">Status priority</option><option value="quality">Missing data</option><option value="metric">Primary KPI</option></select></label>
        <span className="fleet-result-count" aria-live="polite">{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
      </div>

      <div className="fleet-layout">
        <section className="panel fleet-table-panel">
          <div className="panel-heading"><div><h3>Fleet Status</h3><p>Latest dataset-level operating signals</p></div><Wind aria-hidden="true" size={20} /></div>
          {paginated.rows.length ? <ResponsiveTable caption="Fleet dataset status" columns={columns} mobileSummary={(row) => <>{row.dataset.dataset_type.replaceAll("_", " ")} | {primaryMetric(row, currency).value}</>} mobileTitle={(row) => row.dataset.original_filename} rowKey={(row) => row.dataset.id} rows={paginated.rows} /> : <EmptyState title="No matching datasets" detail="Change the search or filters to see more fleet records." action={<button className="secondary-command" onClick={() => { setQuery(""); setDomain("all"); setStatus("all"); }} type="button">Clear filters</button>} />}
          {filtered.length > pageSize ? <nav aria-label="Fleet pagination" className="pagination"><button aria-label="Previous page" disabled={paginated.page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} title="Previous page" type="button"><ChevronLeft size={18} /></button><span>Page {paginated.page} of {paginated.pageCount}</span><button aria-label="Next page" disabled={paginated.page === paginated.pageCount} onClick={() => setPage((current) => Math.min(paginated.pageCount, current + 1))} title="Next page" type="button"><ChevronRight size={18} /></button></nav> : null}
        </section>

        <aside className="fleet-side">
          <section className="panel mix-panel"><div className="panel-heading"><div><h3>Portfolio Mix</h3><p>{datasets.length} connected datasets</p></div><Database aria-hidden="true" size={20} /></div><div className="mix-list">{mix.map((item) => <div key={item.type}><div><span>{item.type.replaceAll("_", " ")}</span><strong>{item.count}</strong></div><div aria-label={`${item.type.replaceAll("_", " ")} ${Math.round(item.share)} percent`} className="mix-track" role="img"><span style={{ width: `${item.share}%` }} /></div></div>)}</div></section>
          <section className="panel attention-panel"><div className="panel-heading"><div><h3>Attention Queue</h3><p>Operational follow-up</p></div><HardHat aria-hidden="true" size={20} /></div><div className="attention-list">{rows.filter((row) => row.status === "attention").slice(0, 5).map((row) => <button key={row.dataset.id} onClick={() => onOpenDataset(row.dataset.id)} type="button"><span><strong>{row.dataset.original_filename}</strong><small>{(row.kpis?.open_work_orders ?? 0) > 0 ? `${row.kpis?.open_work_orders} open work orders` : `${formatMeasurement(row.kpis?.missing_data_percentage, "%", currency, 1)} missing data`}</small></span><ArrowRight aria-hidden="true" size={16} /></button>)}{!totals.attention ? <p className="all-clear">No datasets currently require follow-up.</p> : null}</div></section>
        </aside>
      </div>
    </section>
  );
}
