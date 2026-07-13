"use client";

import {
  AlertTriangle,
  BarChart3,
  Brain,
  FileText,
  LineChart as LineChartIcon,
  Loader2,
  RefreshCcw,
  Search,
  UploadCloud,
  Zap
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
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
import { Anomaly, api, ChartResponse, Dataset, ForecastResponse, KPIResponse, SummaryResponse } from "@/lib/api";

type LoadState = {
  summary: SummaryResponse | null;
  kpis: KPIResponse | null;
  charts: ChartResponse | null;
  anomalies: Anomaly[];
  forecast: ForecastResponse | null;
};

const emptyState: LoadState = {
  summary: null,
  kpis: null,
  charts: null,
  anomalies: [],
  forecast: null
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "n/a";
  }
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function MetricTile({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent?: "green" | "amber" | "red" | "teal";
}) {
  return (
    <div className={`metric-tile ${accent ?? "green"}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function EnergyDashboard() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [state, setState] = useState<LoadState>(emptyState);
  const [forecastDays, setForecastDays] = useState(7);
  const [question, setQuestion] = useState("Which asset is underperforming?");
  const [answer, setAnswer] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string>("");

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedId) ?? null,
    [datasets, selectedId]
  );

  async function loadDatasets(preferredId?: string) {
    const records = await api.listDatasets();
    setDatasets(records);
    if (preferredId) {
      setSelectedId(preferredId);
    } else if (!selectedId && records.length > 0) {
      setSelectedId(records[0].id);
    }
  }

  async function loadDatasetDetails(datasetId: string, days = forecastDays) {
    setIsLoading(true);
    setError("");
    try {
      const [summary, kpis, charts, anomalies, forecast] = await Promise.all([
        api.summary(datasetId),
        api.kpis(datasetId),
        api.charts(datasetId),
        api.anomalies(datasetId),
        api.forecast(datasetId, days)
      ]);
      setState({ summary, kpis, charts, anomalies, forecast });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dataset.");
      setState(emptyState);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDatasets().catch((err) => setError(err instanceof Error ? err.message : "Could not load datasets."));
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadDatasetDetails(selectedId).catch((err) => setError(err instanceof Error ? err.message : "Could not load dataset."));
    }
  }, [selectedId]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setIsUploading(true);
    setError("");
    try {
      const result = await api.uploadDataset(file);
      await loadDatasets(result.dataset.id);
      await loadDatasetDetails(result.dataset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleForecastDays(days: number) {
    setForecastDays(days);
    if (!selectedId) {
      return;
    }
    try {
      const forecast = await api.forecast(selectedId, days);
      setState((current) => ({ ...current, forecast }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Forecast failed.");
    }
  }

  async function handleQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !question.trim()) {
      return;
    }
    setIsAsking(true);
    setAnswer("");
    setError("");
    try {
      const response = await api.ask(selectedId, question.trim());
      setAnswer(response.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Question failed.");
    } finally {
      setIsAsking(false);
    }
  }

  const forecastChartData = useMemo(() => {
    const history =
      state.forecast?.history.map((point) => ({
        date: point.date,
        actual: point.value,
        forecast: null as number | null,
        lower: null as number | null,
        upper: null as number | null
      })) ?? [];
    const forecast =
      state.forecast?.forecast.map((point) => ({
        date: point.date,
        actual: null as number | null,
        forecast: point.predicted_value,
        lower: point.lower_bound,
        upper: point.upper_bound
      })) ?? [];
    return [...history, ...forecast];
  }, [state.forecast]);

  return (
    <main className="dashboard-shell">
      <aside className="dataset-panel">
        <div className="brand-block">
          <div className="brand-mark">
            <Zap size={22} />
          </div>
          <div>
            <h1>AI Energy Data Analyst</h1>
            <p>Renewable operations analytics</p>
          </div>
        </div>

        <label className="upload-control">
          <UploadCloud size={20} />
          <span>{isUploading ? "Uploading..." : "Upload CSV or Excel"}</span>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleUpload} disabled={isUploading} />
        </label>

        <div className="dataset-list">
          <div className="section-label">Datasets</div>
          {datasets.length === 0 ? (
            <div className="empty-copy">No datasets yet.</div>
          ) : (
            datasets.map((dataset) => (
              <button
                className={`dataset-item ${dataset.id === selectedId ? "active" : ""}`}
                key={dataset.id}
                onClick={() => setSelectedId(dataset.id)}
                type="button"
              >
                <span>{dataset.original_filename}</span>
                <small>
                  {dataset.row_count} rows | {dataset.column_count} columns
                </small>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">{selectedDataset ? formatDate(selectedDataset.created_at) : "Ready"}</p>
            <h2>{selectedDataset?.original_filename ?? "Upload an energy dataset"}</h2>
          </div>
          <div className="header-actions">
            <button className="icon-button" onClick={() => selectedId && loadDatasetDetails(selectedId)} disabled={!selectedId || isLoading} type="button">
              {isLoading ? <Loader2 className="spin" size={18} /> : <RefreshCcw size={18} />}
            </button>
            <button
              className="report-button"
              onClick={() => selectedId && window.open(api.reportUrl(selectedId), "_blank", "noopener,noreferrer")}
              disabled={!selectedId}
              type="button"
            >
              <FileText size={18} />
              Report
            </button>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}

        {!selectedId ? (
          <div className="start-panel">
            <UploadCloud size={32} />
            <strong>Start with a solar or wind operations file.</strong>
          </div>
        ) : (
          <>
            <section className="metrics-grid">
              <MetricTile label="Total output" value={formatNumber(state.kpis?.total_output)} accent="green" />
              <MetricTile label="Average daily" value={formatNumber(state.kpis?.average_daily_output)} accent="teal" />
              <MetricTile label="Peak output" value={formatNumber(state.kpis?.peak_output)} accent="amber" />
              <MetricTile label="Downtime hours" value={formatNumber(state.kpis?.downtime_hours)} accent="red" />
            </section>

            <section className="content-grid">
              <div className="panel wide">
                <div className="panel-heading">
                  <div>
                    <h3>Output Trend</h3>
                    <p>{state.kpis?.value_column ?? "Output"} over time</p>
                  </div>
                  <LineChartIcon size={20} />
                </div>
                <div className="chart-frame">
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={state.charts?.time_series ?? []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" minTickGap={28} />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="value" stroke="#087f5b" fill="#d3f9d8" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Asset Ranking</h3>
                    <p>{selectedDataset?.asset_column ?? "Detected assets"}</p>
                  </div>
                  <BarChart3 size={20} />
                </div>
                <div className="chart-frame">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={state.charts?.asset_comparison ?? []} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis dataKey="asset" type="category" width={90} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#0ca678" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Forecast</h3>
                    <p>{state.forecast?.summary ?? "7 day outlook"}</p>
                  </div>
                  <div className="segmented">
                    {[7, 14, 30].map((days) => (
                      <button
                        className={forecastDays === days ? "active" : ""}
                        key={days}
                        onClick={() => handleForecastDays(days)}
                        type="button"
                      >
                        {days}d
                      </button>
                    ))}
                  </div>
                </div>
                <div className="chart-frame">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={forecastChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" minTickGap={28} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="actual" stroke="#087f5b" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="forecast" stroke="#f08c00" strokeWidth={2} />
                      <Line type="monotone" dataKey="upper" stroke="#adb5bd" dot={false} strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="lower" stroke="#adb5bd" dot={false} strokeDasharray="4 4" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Weather Relationship</h3>
                    <p>Weather signal vs output</p>
                  </div>
                  <BarChart3 size={20} />
                </div>
                <div className="chart-frame">
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="weather_value" name="weather" />
                      <YAxis dataKey="output" name="output" />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter data={state.charts?.weather_relationship ?? []} fill="#1098ad" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="lower-grid">
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Anomalies</h3>
                    <p>{state.anomalies.length} events detected</p>
                  </div>
                  <AlertTriangle size={20} />
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Asset</th>
                        <th>Actual</th>
                        <th>Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.anomalies.slice(0, 8).map((item, index) => (
                        <tr key={`${item.timestamp}-${index}`}>
                          <td>{item.timestamp ? new Date(item.timestamp).toLocaleDateString() : "n/a"}</td>
                          <td>{item.asset ?? "All"}</td>
                          <td>{formatNumber(item.actual_value)}</td>
                          <td>
                            <span className={`severity ${item.severity}`}>{item.severity}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Ask Data</h3>
                    <p>Safe intent analysis</p>
                  </div>
                  <Brain size={20} />
                </div>
                <form className="ask-form" onSubmit={handleQuestion}>
                  <div className="question-row">
                    <Search size={18} />
                    <input value={question} onChange={(event) => setQuestion(event.target.value)} />
                    <button disabled={isAsking} type="submit">
                      {isAsking ? <Loader2 className="spin" size={18} /> : "Ask"}
                    </button>
                  </div>
                </form>
                {answer ? <div className="answer-box">{answer}</div> : null}
                <div className="sample-table">
                  <div className="section-label">Columns</div>
                  <div className="column-pills">
                    {state.summary?.columns.slice(0, 12).map((column) => (
                      <span key={column}>{column}</span>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
