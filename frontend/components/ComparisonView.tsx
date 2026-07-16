"use client";

import { BarChart3, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, ErrorState, ProgressState } from "@/components/FeedbackStates";
import { ResponsiveColumn, ResponsiveTable } from "@/components/ResponsiveTable";
import { api, ComparisonResponse, ComparisonRow, Dataset } from "@/lib/api";
import { CurrencyPreference, formatMeasurement, inferUnit } from "@/lib/ui";

function rowUnit(row: ComparisonRow) {
  if (row.metric_type === "maintenance") return "%" as const;
  return inferUnit(row.dataset.value_column, row.metric_type === "demand" ? "MW" : "MWh");
}

export function ComparisonView({ datasets, currency }: { datasets: Dataset[]; currency: CurrencyPreference }) {
  const [selected, setSelected] = useState<string[]>(datasets.slice(0, 2).map((dataset) => dataset.id));
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasCompared, setHasCompared] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSelected((current) => {
      const available = current.filter((id) => datasets.some((dataset) => dataset.id === id));
      return available.length >= 2 ? available : datasets.slice(0, 2).map((dataset) => dataset.id);
    });
  }, [datasets]);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 6 ? [...current, id] : current);
  }

  async function compare() {
    setIsLoading(true);
    setHasCompared(true);
    setError("");
    try { setComparison(await api.compare(selected)); }
    catch (compareError) { setError(compareError instanceof Error ? compareError.message : "Comparison failed."); }
    finally { setIsLoading(false); }
  }

  const columns: ResponsiveColumn<ComparisonRow>[] = [
    { key: "dataset", label: "Dataset", hideFromDetails: true, render: (row) => <strong>{row.dataset.original_filename}</strong> },
    { key: "type", label: "Type", render: (row) => <span className={`domain-label ${row.dataset.dataset_type}`}>{row.metric_type.replaceAll("_", " ")}</span> },
    { key: "primary", label: "Primary value", render: (row) => formatMeasurement(row.primary_value, rowUnit(row), currency) },
    { key: "total", label: "Total", render: (row) => formatMeasurement(row.total_output, inferUnit(row.dataset.value_column, "MWh"), currency) },
    { key: "efficiency", label: "Efficiency", render: (row) => formatMeasurement(row.average_efficiency, "%", currency) },
    { key: "downtime", label: "Downtime", render: (row) => formatMeasurement(row.downtime_hours, "h", currency) },
    { key: "missing", label: "Missing", render: (row) => formatMeasurement(row.missing_data_percentage, "%", currency) }
  ];

  return (
    <section className="comparison-view">
      <section className="panel wide comparison-picker">
        <div className="panel-heading"><div><h3>Compare Datasets</h3><p>Select two to six datasets</p></div><BarChart3 aria-hidden="true" size={20} /></div>
        <div className="dataset-checks">{datasets.map((dataset) => <label key={dataset.id}><input checked={selected.includes(dataset.id)} onChange={() => toggle(dataset.id)} type="checkbox" /><span><strong>{dataset.original_filename}</strong><small>{dataset.dataset_type.replaceAll("_", " ")}</small></span></label>)}</div>
        <button className="primary-command compact" disabled={selected.length < 2 || isLoading} onClick={() => void compare()} type="button">{isLoading ? <Loader2 aria-hidden="true" className="spin" size={18} /> : <BarChart3 aria-hidden="true" size={18} />}Compare</button>
      </section>
      {isLoading ? <ProgressState title="Building fleet comparison" detail="Calculating comparable KPIs for the selected datasets." /> : null}
      {error ? <ErrorState message={error} onRetry={() => void compare()} /> : null}
      {!isLoading && !error && !comparison && !hasCompared ? <EmptyState title="Select datasets to compare" detail="Choose two to six datasets, then run a comparison to see normalized operating metrics." /> : null}
      {!isLoading && !error && hasCompared && !comparison ? <EmptyState title="No comparison available" detail="The selected datasets did not return comparable metrics." /> : null}
      {comparison ? <>
        <section className="panel wide">
          <div className="panel-heading"><div><h3>Primary Metric</h3><p>{comparison.common_period}</p></div><span className="data-badge">{comparison.ranking_metric.replaceAll("_", " ")}</span></div>
          <div aria-label="Primary metric comparison chart" className="chart-frame chart-accessible" role="img"><span className="sr-only">{comparison.datasets.length} datasets ranked by {comparison.ranking_metric.replaceAll("_", " ")}.</span><ResponsiveContainer height={300} width="100%"><BarChart accessibilityLayer data={comparison.datasets.map((row) => ({ name: row.dataset.original_filename, value: row.primary_value }))}><CartesianGrid stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="name" height={68} interval={0} tick={{ fontSize: 11 }} /><YAxis /><Tooltip /><Bar dataKey="value" fill="var(--green)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </section>
        <section className="panel wide"><ResponsiveTable caption="Dataset KPI comparison" columns={columns} mobileSummary={(row) => `${row.metric_type.replaceAll("_", " ")} | ${formatMeasurement(row.primary_value, rowUnit(row), currency)}`} mobileTitle={(row) => row.dataset.original_filename} rowClassName={(row) => row.dataset.id === comparison.leader_dataset_id ? "leader-row" : ""} rowKey={(row) => row.dataset.id} rows={comparison.datasets} /></section>
      </> : null}
    </section>
  );
}
