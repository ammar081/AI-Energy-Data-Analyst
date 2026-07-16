"use client";

import { Database, Gauge, Loader2, Trash2, UploadCloud } from "lucide-react";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminView } from "@/components/AdminView";
import { AppShell, WorkspaceView } from "@/components/AppShell";
import { AuthScreen } from "@/components/AuthScreen";
import { ComparisonView } from "@/components/ComparisonView";
import { DashboardData, DomainDashboard } from "@/components/DomainDashboard";
import { DashboardSkeleton, EmptyState, ErrorState, FleetSkeleton, ToastMessage, ToastRegion } from "@/components/FeedbackStates";
import { FleetOverview } from "@/components/FleetOverview";
import { LiveTelemetryView } from "@/components/LiveTelemetryView";
import { ReportsView } from "@/components/ReportsView";
import { ResponsiveColumn, ResponsiveTable } from "@/components/ResponsiveTable";
import {
  api,
  AskResponse,
  CleaningReport,
  Dataset,
  getAccessToken,
  openHtmlDocument,
  setAccessToken,
  SummaryResponse,
  User
} from "@/lib/api";
import {
  DashboardPeriod,
  defaultPeriod,
  loadPreferences,
  readWorkspaceLocation,
  resolveTheme,
  savePreferences,
  UserPreferences,
  workspaceUrl
} from "@/lib/ui";

const emptyData: DashboardData = {
  summary: null,
  kpis: null,
  charts: null,
  anomalies: [],
  forecast: null,
  demand: null,
  maintenance: null
};

function formatNumber(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not available";
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not available";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function QualityMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "info" | "warning" | "critical" }) {
  return <div className={`domain-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function DataQualityView({ summary }: { summary: SummaryResponse }) {
  const report = summary.cleaning_report as CleaningReport;
  const originalMissing = report.original_missing_values ?? {};
  const visibleColumns = summary.columns.slice(0, 16);
  const mappings = Object.entries(report.columns_used_for_analysis ?? {});
  const inspectionRows = visibleColumns.map((column) => ({ column, type: summary.dtypes[column], original: originalMissing[column] ?? 0, cleaned: summary.missing_values[column] ?? 0 }));
  const inspectionColumns: ResponsiveColumn<(typeof inspectionRows)[number]>[] = [
    { key: "column", label: "Column", hideFromDetails: true, render: (row) => <strong>{row.column}</strong> },
    { key: "type", label: "Inferred type", render: (row) => row.type },
    { key: "original", label: "Original missing", render: (row) => row.original },
    { key: "cleaned", label: "After cleaning", render: (row) => row.cleaned }
  ];
  const sampleRows = summary.sample_rows.map((row, index) => ({ ...row, __rowIndex: index + 1 }));
  const sampleColumns: ResponsiveColumn<Record<string, unknown>>[] = visibleColumns.map((column) => ({ key: column, label: column, render: (row) => formatCell(row[column]) }));

  return (
    <section className="quality-view">
      <div className="domain-context">
        <div className="domain-context-icon quality"><Database size={20} /></div>
        <div><strong>Data validation</strong><span>Cleaning and schema inspection</span></div>
        <small>{summary.dataset.row_count.toLocaleString()} cleaned records</small>
      </div>
      <section className="domain-metrics quality-metrics">
        <QualityMetric label="Original rows" value={formatNumber(report.original_rows)} />
        <QualityMetric label="Cleaned rows" value={formatNumber(report.cleaned_rows)} tone="info" />
        <QualityMetric label="Missing values fixed" value={formatNumber(report.missing_values_fixed)} tone="warning" />
        <QualityMetric label="Duplicates removed" value={formatNumber(report.duplicate_rows_removed)} />
        <QualityMetric label="Invalid timestamps" value={formatNumber(report.invalid_timestamps_removed)} tone="critical" />
        <QualityMetric label="Original missing" value={formatNumber(report.original_missing_percentage, "%")} tone="warning" />
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h3>Column Inspection</h3><p>Inferred types and missing-value counts</p></div><Database size={20} /></div>
        <ResponsiveTable caption="Column data quality inspection" columns={inspectionColumns} mobileSummary={(row) => `${row.type} | ${row.cleaned} missing after cleaning`} mobileTitle={(row) => row.column} rowKey={(row) => row.column} rows={inspectionRows} />
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h3>Sample Records</h3><p>First {summary.sample_rows.length} cleaned rows</p></div><Database size={20} /></div>
        <div className="sample-grid"><ResponsiveTable caption="Cleaned sample records" columns={sampleColumns} mobileSummary={() => `${visibleColumns.length} columns`} mobileTitle={(row) => `Record ${row.__rowIndex}`} rowKey={(row) => String(row.__rowIndex)} rows={sampleRows} /></div>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h3>Analysis Mapping</h3><p>Columns selected for operational analytics</p></div><Gauge size={20} /></div>
        {mappings.length ? <div className="mapping-grid">{mappings.map(([key, value]) => <div key={key}><span>{key.replaceAll("_", " ")}</span><strong>{Array.isArray(value) ? value.join(", ") || "Not detected" : value ?? "Not detected"}</strong></div>)}</div> : <EmptyState title="No analysis mapping" detail="The uploaded columns could not be mapped to known energy fields." />}
      </section>
    </section>
  );
}

export function EnergyDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [data, setData] = useState<DashboardData>(emptyData);
  const [forecastDays, setForecastDays] = useState(7);
  const [view, setView] = useState<WorkspaceView>("fleet");
  const [period, setPeriod] = useState<DashboardPeriod>(defaultPeriod);
  const [preferences, setPreferences] = useState<UserPreferences>(loadPreferences);
  const [question, setQuestion] = useState("Which asset is underperforming?");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [isDatasetsLoading, setIsDatasetsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Dataset | null>(null);
  const [fleetError, setFleetError] = useState("");
  const [dataError, setDataError] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const deleteDialog = useRef<HTMLDivElement>(null);
  const deleteCancelButton = useRef<HTMLButtonElement>(null);

  const selectedDataset = useMemo(() => datasets.find((dataset) => dataset.id === selectedId) ?? null, [datasets, selectedId]);
  const notify = useCallback((message: string, type: ToastMessage["type"] = "info") => setToast({ id: Date.now(), message, type }), []);
  const dismissToast = useCallback(() => setToast(null), []);

  const loadDatasets = useCallback(async (preferredId?: string) => {
    setIsDatasetsLoading(true);
    setFleetError("");
    try {
      const records = await api.listDatasets();
      setDatasets(records);
      setSelectedId((current) => {
        if (preferredId && records.some((dataset) => dataset.id === preferredId)) return preferredId;
        if (records.some((dataset) => dataset.id === current)) return current;
        return records[0]?.id ?? "";
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load datasets.";
      setFleetError(message);
      notify(message, "error");
    } finally {
      setIsDatasetsLoading(false);
    }
  }, [notify]);

  const loadDatasetDetails = useCallback(async (datasetId: string, days: number) => {
    setIsLoading(true);
    setDataError("");
    try {
      const [summary, kpis, charts, anomalies, forecast, demand, maintenance] = await Promise.all([
        api.summary(datasetId),
        api.kpis(datasetId),
        api.charts(datasetId),
        api.anomalies(datasetId),
        api.forecast(datasetId, days),
        api.demand(datasetId, days),
        api.maintenance(datasetId)
      ]);
      setData({ summary, kpis, charts, anomalies, forecast, demand, maintenance });
      setAnswer(null);
    } catch (error) {
      setData(emptyData);
      setDataError(error instanceof Error ? error.message : "Could not load dataset analysis.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const route = readWorkspaceLocation(window.location.search);
    const storedPreferences = loadPreferences();
    setPreferences(storedPreferences);
    setView(route.view);
    setSelectedId(route.datasetId);
    setPeriod(route.period.preset === "all" && !new URLSearchParams(window.location.search).has("range")
      ? { preset: storedPreferences.defaultPeriod, from: "", to: "" }
      : route.period);
    function onPopState() {
      const next = readWorkspaceLocation(window.location.search);
      setView(next.view);
      setSelectedId(next.datasetId);
      setPeriod(next.period);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    savePreferences(preferences);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function applyTheme() {
      document.documentElement.dataset.theme = resolveTheme(preferences.theme, media.matches);
      document.documentElement.dataset.density = preferences.density;
    }
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [preferences]);

  useEffect(() => {
    if (!pendingDelete) return;
    deleteCancelButton.current?.focus();
    function handleDialogKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !deletingId) setPendingDelete(null);
      if (event.key !== "Tab") return;
      const controls = deleteDialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", handleDialogKey);
    return () => window.removeEventListener("keydown", handleDialogKey);
  }, [deletingId, pendingDelete]);

  useEffect(() => {
    if (!getAccessToken()) {
      setIsCheckingAuth(false);
      return;
    }
    api.me().then(setUser).catch(() => setAccessToken(null)).finally(() => setIsCheckingAuth(false));
  }, []);

  useEffect(() => {
    if (user) void loadDatasets();
  }, [loadDatasets, user]);

  useEffect(() => {
    if (user && selectedId) void loadDatasetDetails(selectedId, 7);
  }, [loadDatasetDetails, selectedId, user]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const result = await api.uploadDataset(file);
      await loadDatasets(result.dataset.id);
      setView("analysis");
      window.history.pushState(null, "", workspaceUrl("analysis", result.dataset.id, period));
      notify(`${result.dataset.original_filename} uploaded successfully.`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Upload failed.", "error");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleDeleteDataset(dataset: Dataset) {
    setDeletingId(dataset.id);
    try {
      await api.deleteDataset(dataset.id);
      const remaining = datasets.filter((item) => item.id !== dataset.id);
      setDatasets(remaining);
      if (selectedId === dataset.id) {
        setData(emptyData);
        setAnswer(null);
        setSelectedId(remaining[0]?.id ?? "");
      }
      setPendingDelete(null);
      notify(`${dataset.original_filename} was deleted.`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not delete dataset.", "error");
    } finally {
      setDeletingId("");
    }
  }

  async function handleForecastDays(days: number) {
    setForecastDays(days);
    if (!selectedId) return;
    try {
      const [forecast, demand] = await Promise.all([api.forecast(selectedId, days), api.demand(selectedId, days)]);
      setData((current) => ({ ...current, forecast, demand }));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Forecast could not be updated.", "error");
    }
  }

  async function handleQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !question.trim()) return;
    setIsAsking(true);
    setAnswer(null);
    try {
      setAnswer(await api.ask(selectedId, question.trim()));
    } catch (error) {
      notify(error instanceof Error ? error.message : "The question could not be answered.", "error");
    } finally {
      setIsAsking(false);
    }
  }

  function logout() {
    setAccessToken(null);
    setUser(null);
    setDatasets([]);
    setSelectedId("");
    setData(emptyData);
    setView("fleet");
    window.history.replaceState(null, "", "/");
  }

  function openDataset(datasetId: string) {
    setSelectedId(datasetId);
    setView("analysis");
    window.history.pushState(null, "", workspaceUrl("analysis", datasetId, period));
  }

  function changeView(nextView: WorkspaceView) {
    setView(nextView);
    window.history.pushState(null, "", workspaceUrl(nextView, selectedId, period));
  }

  function changeDataset(datasetId: string) {
    setSelectedId(datasetId);
    window.history.pushState(null, "", workspaceUrl(view, datasetId, period));
  }

  function changePeriod(nextPeriod: DashboardPeriod) {
    setPeriod(nextPeriod);
    window.history.pushState(null, "", workspaceUrl("analysis", selectedId, nextPeriod));
  }

  function renderDatasetState(content: React.ReactNode) {
    if (!selectedDataset) return <EmptyState icon={<Database size={25} />} title="Select a dataset" detail="Choose a dataset from the toolbar or return to the fleet overview." action={<button className="secondary-command" onClick={() => changeView("fleet")} type="button">Open fleet overview</button>} />;
    if (isLoading) return <DashboardSkeleton />;
    if (dataError) return <ErrorState message={dataError} onRetry={() => void loadDatasetDetails(selectedDataset.id, forecastDays)} />;
    return content;
  }

  if (isCheckingAuth) return <main className="auth-shell"><Loader2 className="spin" size={28} /><span className="sr-only">Checking session</span></main>;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;

  let content: React.ReactNode;
  if (view === "fleet") {
    content = isDatasetsLoading ? <FleetSkeleton /> : fleetError ? <ErrorState message={fleetError} onRetry={() => void loadDatasets()} /> : <FleetOverview currency={preferences.currency} datasets={datasets} isUploading={isUploading} onDeleteDataset={setPendingDelete} onOpenDataset={openDataset} onUpload={() => fileInput.current?.click()} pageSize={preferences.fleetPageSize} user={user} />;
  } else if (view === "analysis") {
    content = renderDatasetState(selectedDataset ? <DomainDashboard answer={answer} currency={preferences.currency} data={data} dataset={selectedDataset} forecastDays={forecastDays} isAsking={isAsking} onAsk={handleQuestion} onForecastDays={handleForecastDays} onPeriodChange={changePeriod} period={period} question={question} setQuestion={setQuestion} /> : null);
  } else if (view === "quality") {
    content = renderDatasetState(data.summary ? <DataQualityView summary={data.summary} /> : <EmptyState title="Quality details unavailable" detail="The dataset summary did not include a cleaning report." />);
  } else if (view === "compare") {
    content = datasets.length >= 2 ? <ComparisonView currency={preferences.currency} datasets={datasets} /> : <EmptyState title="Nothing to compare" detail="Upload at least two datasets to create a fleet comparison." />;
  } else if (view === "reports") {
    content = renderDatasetState(<ReportsView dataset={selectedDataset} onNotify={notify} user={user} />);
  } else if (view === "live") {
    content = renderDatasetState(<LiveTelemetryView currency={preferences.currency} dataset={selectedDataset} onNotify={notify} />);
  } else {
    content = user.role === "admin" ? <AdminView currentUser={user} onNotify={notify} /> : <ErrorState message="Administrator access is required for this view." />;
  }

  return (
    <>
      <input accept=".csv,.xlsx,.xls" className="hidden-file-input" disabled={isUploading} onChange={handleUpload} ref={fileInput} type="file" />
      <AppShell
        datasets={datasets}
        isRefreshing={isLoading}
        isUploading={isUploading}
        onDatasetChange={changeDataset}
        onLogout={logout}
        onRefresh={() => selectedId && void loadDatasetDetails(selectedId, forecastDays)}
        onReport={() => selectedId && void openHtmlDocument(() => api.reportHtml(selectedId)).catch((error) => notify(error instanceof Error ? error.message : "Could not open report.", "error"))}
        onUpload={() => fileInput.current?.click()}
        onViewChange={changeView}
        onPreferencesChange={setPreferences}
        preferences={preferences}
        selectedId={selectedId}
        user={user}
        view={view}
      >
        {content}
      </AppShell>
      <ToastRegion onDismiss={dismissToast} toast={toast} />
      {pendingDelete ? <div className="modal-backdrop" role="presentation"><div aria-describedby="delete-dialog-description" aria-labelledby="delete-dialog-title" aria-modal="true" className="delete-dialog" ref={deleteDialog} role="dialog"><div className="delete-dialog-icon"><Trash2 aria-hidden="true" size={20} /></div><div><h3 id="delete-dialog-title">Delete dataset?</h3><p id="delete-dialog-description"><strong>{pendingDelete.original_filename}</strong> and its cleaned data will be permanently removed.</p></div><div className="delete-dialog-actions"><button disabled={Boolean(deletingId)} onClick={() => setPendingDelete(null)} ref={deleteCancelButton} type="button">Cancel</button><button className="danger-button" disabled={Boolean(deletingId)} onClick={() => void handleDeleteDataset(pendingDelete)} type="button">{deletingId ? <Loader2 aria-hidden="true" className="spin" size={17} /> : <Trash2 aria-hidden="true" size={17} />}Delete</button></div></div></div> : null}
    </>
  );
}
