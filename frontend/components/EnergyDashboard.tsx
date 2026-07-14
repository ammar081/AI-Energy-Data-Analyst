"use client";

import {
  AlertTriangle,
  BarChart3,
  Brain,
  Database,
  FileText,
  Gauge,
  LineChart as LineChartIcon,
  Loader2,
  RefreshCcw,
  Search,
  Trash2,
  UploadCloud,
  Zap
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  Anomaly,
  api,
  AskResponse,
  ChartResponse,
  CleaningReport,
  Dataset,
  ForecastResponse,
  KPIResponse,
  SummaryResponse
} from "@/lib/api";

type LoadState = {
  summary: SummaryResponse | null;
  kpis: KPIResponse | null;
  charts: ChartResponse | null;
  anomalies: Anomaly[];
  forecast: ForecastResponse | null;
};

const emptyState: LoadState = { summary: null, kpis: null, charts: null, anomalies: [], forecast: null };

function formatNumber(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

function formatDate(value: string | null) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") return "n/a";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function MetricTile({ label, value, accent = "green", detail }: { label: string; value: string; accent?: "green" | "amber" | "red" | "teal"; detail?: string }) {
  return (
    <div className={`metric-tile ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function DataQualityView({ summary }: { summary: SummaryResponse }) {
  const report = summary.cleaning_report as CleaningReport;
  const originalMissing = report.original_missing_values ?? {};
  const visibleColumns = summary.columns.slice(0, 16);

  return (
    <section className="quality-view">
      <div className="quality-summary">
        <MetricTile label="Original rows" value={formatNumber(report.original_rows)} />
        <MetricTile label="Cleaned rows" value={formatNumber(report.cleaned_rows)} accent="teal" />
        <MetricTile label="Missing fixed" value={formatNumber(report.missing_values_fixed)} accent="amber" />
        <MetricTile label="Duplicates removed" value={formatNumber(report.duplicate_rows_removed)} accent="red" />
        <MetricTile label="Invalid timestamps" value={formatNumber(report.invalid_timestamps_removed)} />
        <MetricTile label="Negative values repaired" value={formatNumber(report.negative_values_replaced)} accent="teal" />
        <MetricTile label="Outlier cells" value={formatNumber(report.outlier_cells_detected)} accent="amber" />
        <MetricTile label="Original missing" value={formatNumber(report.original_missing_percentage, "%")} accent="red" />
      </div>

      <div className="panel wide">
        <div className="panel-heading">
          <div><h3>Column Inspection</h3><p>Inferred types and quality counts</p></div>
          <Database size={20} />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Column</th><th>Inferred type</th><th>Original missing</th><th>After cleaning</th></tr></thead>
            <tbody>
              {visibleColumns.map((column) => (
                <tr key={column}>
                  <td><strong>{column}</strong></td>
                  <td>{summary.dtypes[column]}</td>
                  <td>{originalMissing[column] ?? 0}</td>
                  <td>{summary.missing_values[column] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel wide">
        <div className="panel-heading">
          <div><h3>Sample Rows</h3><p>First {summary.sample_rows.length} cleaned records</p></div>
          <Database size={20} />
        </div>
        <div className="table-wrap sample-grid">
          <table>
            <thead><tr>{visibleColumns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>
              {summary.sample_rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{visibleColumns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel wide">
        <div className="panel-heading">
          <div><h3>Analysis Mapping</h3><p>Columns selected by the backend</p></div>
          <Gauge size={20} />
        </div>
        <div className="mapping-grid">
          {Object.entries(report.columns_used_for_analysis ?? {}).map(([key, value]) => (
            <div key={key}><span>{key.replaceAll("_", " ")}</span><strong>{Array.isArray(value) ? value.join(", ") || "Not detected" : value ?? "Not detected"}</strong></div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function EnergyDashboard() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [state, setState] = useState<LoadState>(emptyState);
  const [forecastDays, setForecastDays] = useState(7);
  const [activeView, setActiveView] = useState<"overview" | "quality">("overview");
  const [question, setQuestion] = useState("Which asset is underperforming?");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Dataset | null>(null);
  const [error, setError] = useState("");

  const selectedDataset = useMemo(() => datasets.find((dataset) => dataset.id === selectedId) ?? null, [datasets, selectedId]);

  async function loadDatasets(preferredId?: string) {
    const records = await api.listDatasets();
    setDatasets(records);
    if (preferredId) setSelectedId(preferredId);
    else if (!selectedId && records.length > 0) setSelectedId(records[0].id);
  }

  async function loadDatasetDetails(datasetId: string, days = forecastDays) {
    setIsLoading(true);
    setError("");
    try {
      const [summary, kpis, charts, anomalies, forecast] = await Promise.all([
        api.summary(datasetId), api.kpis(datasetId), api.charts(datasetId), api.anomalies(datasetId), api.forecast(datasetId, days)
      ]);
      setState({ summary, kpis, charts, anomalies, forecast });
      setAnswer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dataset.");
      setState(emptyState);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadDatasets().catch((err) => setError(err instanceof Error ? err.message : "Could not load datasets.")); }, []);
  useEffect(() => { if (selectedId) loadDatasetDetails(selectedId).catch((err) => setError(err instanceof Error ? err.message : "Could not load dataset.")); }, [selectedId]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setError("");
    try {
      const result = await api.uploadDataset(file);
      await loadDatasets(result.dataset.id);
      setActiveView("overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleDeleteDataset(dataset: Dataset) {
    setDeletingId(dataset.id);
    setError("");
    try {
      await api.deleteDataset(dataset.id);
      const remaining = datasets.filter((item) => item.id !== dataset.id);
      setDatasets(remaining);
      if (selectedId === dataset.id) {
        setState(emptyState);
        setAnswer(null);
        setSelectedId(remaining[0]?.id ?? "");
      }
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete dataset.");
    } finally {
      setDeletingId("");
    }
  }

  async function handleForecastDays(days: number) {
    setForecastDays(days);
    if (!selectedId) return;
    try {
      const forecast = await api.forecast(selectedId, days);
      setState((current) => ({ ...current, forecast }));
    } catch (err) { setError(err instanceof Error ? err.message : "Forecast failed."); }
  }

  async function handleQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !question.trim()) return;
    setIsAsking(true);
    setAnswer(null);
    setError("");
    try { setAnswer(await api.ask(selectedId, question.trim())); }
    catch (err) { setError(err instanceof Error ? err.message : "Question failed."); }
    finally { setIsAsking(false); }
  }

  const forecastChartData = useMemo(() => {
    const history = state.forecast?.history.map((point) => ({ date: point.date, actual: point.value, forecast: null, lower: null, upper: null })) ?? [];
    const forecast = state.forecast?.forecast.map((point) => ({ date: point.date, actual: null, forecast: point.predicted_value, lower: point.lower_bound, upper: point.upper_bound })) ?? [];
    return [...history, ...forecast];
  }, [state.forecast]);

  const anomalyPoints = useMemo(() => state.anomalies.filter((item) => item.timestamp).map((item) => ({
    date: item.timestamp!.slice(0, 10), anomaly: item.actual_value, severity: item.severity, method: item.method
  })), [state.anomalies]);

  return (
    <main className="dashboard-shell">
      <aside className="dataset-panel">
        <div className="brand-block"><div className="brand-mark"><Zap size={22} /></div><div><h1>AI Energy Data Analyst</h1><p>Renewable operations analytics</p></div></div>
        <label className="upload-control"><UploadCloud size={20} /><span>{isUploading ? "Uploading..." : "Upload CSV or Excel"}</span><input type="file" accept=".csv,.xlsx,.xls" onChange={handleUpload} disabled={isUploading} /></label>
        <div className="dataset-list">
          <div className="section-label">Datasets</div>
          {datasets.length === 0 ? <div className="empty-copy">No datasets yet.</div> : datasets.map((dataset) => (
            <div className="dataset-row" key={dataset.id}>
              <button className={`dataset-item ${dataset.id === selectedId ? "active" : ""}`} onClick={() => setSelectedId(dataset.id)} type="button">
                <span>{dataset.original_filename}</span><small>{dataset.row_count} rows | {dataset.column_count} columns</small>
              </button>
              <button
                aria-label={`Delete ${dataset.original_filename}`}
                className="dataset-delete"
                disabled={deletingId === dataset.id}
                onClick={() => setPendingDelete(dataset)}
                title="Delete dataset"
                type="button"
              >
                {deletingId === dataset.id ? <Loader2 className="spin" size={17} /> : <Trash2 size={17} />}
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div><p className="eyebrow">{selectedDataset ? formatDate(selectedDataset.created_at) : "Ready"}</p><h2>{selectedDataset?.original_filename ?? "Upload an energy dataset"}</h2></div>
          <div className="header-actions">
            <button aria-label="Refresh analysis" title="Refresh analysis" className="icon-button" onClick={() => selectedId && loadDatasetDetails(selectedId)} disabled={!selectedId || isLoading} type="button">{isLoading ? <Loader2 className="spin" size={18} /> : <RefreshCcw size={18} />}</button>
            <button className="report-button" onClick={() => selectedId && window.open(api.reportUrl(selectedId), "_blank", "noopener,noreferrer")} disabled={!selectedId} type="button"><FileText size={18} />Report</button>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}
        {!selectedId ? <div className="start-panel"><UploadCloud size={32} /><strong>Start with a solar or wind operations file.</strong></div> : (
          <>
            <nav className="view-tabs" aria-label="Dataset views">
              <button className={activeView === "overview" ? "active" : ""} onClick={() => setActiveView("overview")} type="button"><Gauge size={17} />Overview</button>
              <button className={activeView === "quality" ? "active" : ""} onClick={() => setActiveView("quality")} type="button"><Database size={17} />Data Quality</button>
            </nav>

            {activeView === "quality" && state.summary ? <DataQualityView summary={state.summary} /> : (
              <>
                <section className="metrics-grid">
                  <MetricTile label="Total output" value={formatNumber(state.kpis?.total_output)} />
                  <MetricTile label="Average daily" value={formatNumber(state.kpis?.average_daily_output)} accent="teal" />
                  <MetricTile label="Peak output" value={formatNumber(state.kpis?.peak_output)} accent="amber" />
                  <MetricTile label="Lowest output" value={formatNumber(state.kpis?.lowest_output)} accent="red" />
                  <MetricTile label="Capacity factor" value={formatNumber(state.kpis?.capacity_factor, "%")} />
                  <MetricTile label="Downtime hours" value={formatNumber(state.kpis?.downtime_hours)} detail={state.kpis?.downtime_basis?.replaceAll("_", " ")} accent="red" />
                  <MetricTile label="Missing data" value={formatNumber(state.kpis?.missing_data_percentage, "%")} accent="amber" />
                  <MetricTile label="Best asset" value={state.kpis?.best_performing_asset?.asset ?? "n/a"} detail={state.kpis?.underperforming_asset ? `Needs attention: ${state.kpis.underperforming_asset.asset}` : undefined} accent="teal" />
                </section>

                <section className="content-grid">
                  <div className="panel wide">
                    <div className="panel-heading"><div><h3>Output Trend and Anomalies</h3><p>{state.kpis?.value_column ?? "Output"} over time</p></div><LineChartIcon size={20} /></div>
                    <div className="chart-frame"><ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={state.charts?.time_series ?? []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" minTickGap={28} /><YAxis /><Tooltip /><Legend />
                        <Area type="monotone" name="Output" dataKey="value" stroke="#087f5b" fill="#d3f9d8" strokeWidth={2} />
                        <Scatter name="Anomaly" data={anomalyPoints} dataKey="anomaly" fill="#c92a2a" />
                      </ComposedChart>
                    </ResponsiveContainer></div>
                  </div>

                  <div className="panel">
                    <div className="panel-heading"><div><h3>Asset Ranking</h3><p>{selectedDataset?.asset_column ?? "Detected assets"}</p></div><BarChart3 size={20} /></div>
                    <div className="chart-frame"><ResponsiveContainer width="100%" height={280}><BarChart data={state.charts?.asset_comparison ?? []} layout="vertical" margin={{ left: 24 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" /><YAxis dataKey="asset" type="category" width={90} /><Tooltip /><Bar dataKey="value" fill="#0ca678" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
                  </div>

                  <div className="panel">
                    <div className="panel-heading"><div><h3>Forecast</h3><p>{state.forecast?.summary ?? "Output outlook"}</p></div><div className="segmented">{[7, 14, 30].map((days) => <button className={forecastDays === days ? "active" : ""} key={days} onClick={() => handleForecastDays(days)} type="button">{days}d</button>)}</div></div>
                    <div className="forecast-meta"><span>Model: {state.forecast?.method.replaceAll("_", " ") ?? "n/a"}</span><span>MAE {formatNumber(state.forecast?.metrics.mae)} | RMSE {formatNumber(state.forecast?.metrics.rmse)}</span></div>
                    <div className="chart-frame"><ResponsiveContainer width="100%" height={280}><LineChart data={forecastChartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" minTickGap={28} /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="actual" stroke="#087f5b" dot={false} strokeWidth={2} /><Line type="monotone" dataKey="forecast" stroke="#f08c00" strokeWidth={2} /><Line type="monotone" dataKey="upper" stroke="#868e96" dot={false} strokeDasharray="4 4" /><Line type="monotone" dataKey="lower" stroke="#868e96" dot={false} strokeDasharray="4 4" /></LineChart></ResponsiveContainer></div>
                  </div>

                  <div className="panel">
                    <div className="panel-heading"><div><h3>Weather Relationship</h3><p>Weather signal vs output</p></div><BarChart3 size={20} /></div>
                    <div className="chart-frame"><ResponsiveContainer width="100%" height={280}><ScatterChart><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="weather_value" name="weather" /><YAxis dataKey="output" name="output" /><Tooltip cursor={{ strokeDasharray: "3 3" }} /><Scatter data={state.charts?.weather_relationship ?? []} fill="#1098ad" /></ScatterChart></ResponsiveContainer></div>
                  </div>
                </section>

                <section className="lower-grid">
                  <div className="panel">
                    <div className="panel-heading"><div><h3>Anomalies</h3><p>{state.anomalies.length} events detected</p></div><AlertTriangle size={20} /></div>
                    <div className="table-wrap"><table><thead><tr><th>Time</th><th>Asset</th><th>Signal</th><th>Severity</th><th>Explanation</th></tr></thead><tbody>
                      {state.anomalies.slice(0, 8).map((item, index) => <tr key={`${item.timestamp}-${item.method}-${index}`}><td>{item.timestamp ? new Date(item.timestamp).toLocaleDateString() : "n/a"}</td><td>{item.asset ?? "All"}</td><td>{item.method.replaceAll("_", " ")}<small className="table-value">Actual: {formatNumber(item.actual_value)}</small></td><td><span className={`severity ${item.severity}`}>{item.severity}</span></td><td className="explanation-cell">{item.possible_explanation}</td></tr>)}
                    </tbody></table></div>
                  </div>

                  <div className="panel">
                    <div className="panel-heading"><div><h3>Ask Data</h3><p>Validated intent analysis</p></div><Brain size={20} /></div>
                    <form className="ask-form" onSubmit={handleQuestion}><div className="question-row"><Search size={18} /><input aria-label="Ask a question about this dataset" value={question} onChange={(event) => setQuestion(event.target.value)} /><button disabled={isAsking} type="submit">{isAsking ? <Loader2 className="spin" size={18} /> : "Ask"}</button></div></form>
                    {answer ? <div className="answer-box"><div className="answer-meta"><span>{answer.source === "gemini" ? "Gemini assisted" : "Rules analysis"}</span><span>{answer.analysis_period}</span></div><strong>{answer.explanation.what_happened}</strong><dl><dt>Why it matters</dt><dd>{answer.explanation.why_it_matters}</dd><dt>Possible reason</dt><dd>{answer.explanation.possible_reason}</dd><dt>Next step</dt><dd>{answer.explanation.suggested_next_step}</dd></dl></div> : null}
                    <div className="sample-table"><div className="section-label">Try asking</div><div className="question-suggestions">{["Which plant produced the most energy this month?", "Which day had the biggest production drop?", "What factors seem related to low production?"].map((item) => <button key={item} onClick={() => setQuestion(item)} type="button">{item}</button>)}</div></div>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </section>
      {pendingDelete ? (
        <div className="modal-backdrop" role="presentation">
          <div aria-labelledby="delete-dialog-title" aria-modal="true" className="delete-dialog" role="dialog">
            <div className="delete-dialog-icon"><Trash2 size={20} /></div>
            <div>
              <h3 id="delete-dialog-title">Delete dataset?</h3>
              <p><strong>{pendingDelete.original_filename}</strong> and its cleaned data will be permanently removed.</p>
            </div>
            <div className="delete-dialog-actions">
              <button disabled={Boolean(deletingId)} onClick={() => setPendingDelete(null)} type="button">Cancel</button>
              <button className="danger-button" disabled={Boolean(deletingId)} onClick={() => handleDeleteDataset(pendingDelete)} type="button">
                {deletingId ? <Loader2 className="spin" size={17} /> : <Trash2 size={17} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
