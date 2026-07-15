"use client";

import { BarChart3, Loader2 } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, ComparisonResponse, Dataset } from "@/lib/api";

function format(value: number | null, suffix = "") {
  return value === null ? "n/a" : `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

export function ComparisonView({ datasets }: { datasets: Dataset[] }) {
  const [selected, setSelected] = useState<string[]>(datasets.slice(0, 2).map((dataset) => dataset.id));
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 6 ? [...current, id] : current);
  }

  async function compare() {
    setIsLoading(true);
    setError("");
    try { setComparison(await api.compare(selected)); }
    catch (err) { setError(err instanceof Error ? err.message : "Comparison failed."); }
    finally { setIsLoading(false); }
  }

  return (
    <section className="comparison-view">
      <div className="panel wide comparison-picker">
        <div className="panel-heading"><div><h3>Compare Datasets</h3><p>Select two to six datasets</p></div><BarChart3 size={20} /></div>
        <div className="dataset-checks">{datasets.map((dataset) => <label key={dataset.id}><input checked={selected.includes(dataset.id)} onChange={() => toggle(dataset.id)} type="checkbox" /><span><strong>{dataset.original_filename}</strong><small>{dataset.dataset_type.replaceAll("_", " ")}</small></span></label>)}</div>
        <button className="primary-command compact" disabled={selected.length < 2 || isLoading} onClick={compare} type="button">{isLoading ? <Loader2 className="spin" size={18} /> : <BarChart3 size={18} />}Compare</button>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      {comparison ? <>
        <div className="panel wide">
          <div className="panel-heading"><div><h3>Primary Metric</h3><p>{comparison.common_period}</p></div><span className="data-badge">{comparison.ranking_metric.replaceAll("_", " ")}</span></div>
          <div className="chart-frame"><ResponsiveContainer height={300} width="100%"><BarChart data={comparison.datasets.map((row) => ({ name: row.dataset.original_filename, value: row.primary_value }))}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" height={68} interval={0} tick={{ fontSize: 11 }} /><YAxis /><Tooltip /><Bar dataKey="value" fill="#087f5b" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </div>
        <div className="panel wide"><div className="table-wrap"><table><thead><tr><th>Dataset</th><th>Type</th><th>Primary value</th><th>Total</th><th>Efficiency</th><th>Downtime</th><th>Missing</th></tr></thead><tbody>{comparison.datasets.map((row) => <tr key={row.dataset.id} className={row.dataset.id === comparison.leader_dataset_id ? "leader-row" : ""}><td><strong>{row.dataset.original_filename}</strong></td><td>{row.metric_type.replaceAll("_", " ")}</td><td>{format(row.primary_value)}</td><td>{format(row.total_output)}</td><td>{format(row.average_efficiency, "%")}</td><td>{format(row.downtime_hours)}</td><td>{format(row.missing_data_percentage, "%")}</td></tr>)}</tbody></table></div></div>
      </> : null}
    </section>
  );
}
