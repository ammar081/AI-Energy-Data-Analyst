"use client";

import { AlertTriangle, BarChart3, Brain, Gauge, Loader2, Search, Settings, TrendingUp, Wrench, Zap } from "lucide-react";
import { Dispatch, FormEvent, ReactNode, SetStateAction, useMemo } from "react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { DashboardPeriodControl } from "@/components/DashboardPeriodControl";
import { EmptyState } from "@/components/FeedbackStates";
import { ResponsiveColumn, ResponsiveTable } from "@/components/ResponsiveTable";
import { Anomaly, AskResponse, ChartResponse, CleaningReport, Dataset, DemandAnalysis, ForecastResponse, KPIResponse, MaintenanceAnalysis, SummaryResponse } from "@/lib/api";
import { CurrencyPreference, DashboardPeriod, filterByPeriod, formatMeasurement, inferUnit, MeasurementUnit, numericSummary, periodLabel } from "@/lib/ui";

export type DashboardData = {
  summary: SummaryResponse | null;
  kpis: KPIResponse | null;
  charts: ChartResponse | null;
  anomalies: Anomaly[];
  forecast: ForecastResponse | null;
  demand: DemandAnalysis | null;
  maintenance: MaintenanceAnalysis | null;
};

type Tone = "default" | "info" | "warning" | "critical";

function Metric({ label, value, detail, tone = "default" }: { label: string; value: string; detail?: string; tone?: Tone }) {
  return <div className={`domain-metric ${tone}`}><span>{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</div>;
}

function ChartRegion({ label, summary, children }: { label: string; summary: string; children: ReactNode }) {
  return <div aria-label={label} className="chart-frame chart-accessible" role="img"><span className="sr-only">{summary}</span>{children}</div>;
}

function ForecastChart({ forecast, unit, currency, label }: { forecast: ForecastResponse | null; unit: MeasurementUnit; currency: CurrencyPreference; label: string }) {
  const rows = useMemo(() => [
    ...(forecast?.history.map((point) => ({ date: point.date, actual: point.value, forecast: null, lower: null, upper: null })) ?? []),
    ...(forecast?.forecast.map((point) => ({ date: point.date, actual: null, forecast: point.predicted_value, lower: point.lower_bound, upper: point.upper_bound })) ?? [])
  ], [forecast]);
  if (!rows.length) return <EmptyState title="Forecast unavailable" detail="More dated observations are required for a forecast." />;
  return <ChartRegion label={label} summary={`${forecast?.horizon_days ?? 0}-day forecast using ${forecast?.method.replaceAll("_", " ") ?? "the available model"}.`}><ResponsiveContainer height={286} width="100%"><LineChart accessibilityLayer data={rows}><CartesianGrid stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="date" minTickGap={28} tickLine={false} /><YAxis tickLine={false} /><Tooltip formatter={(value) => formatMeasurement(Number(value), unit, currency)} /><Legend /><Line dataKey="actual" dot={false} name={`Actual (${unit})`} stroke="var(--green)" strokeWidth={2} /><Line dataKey="forecast" dot={false} name={`Forecast (${unit})`} stroke="var(--amber)" strokeWidth={2} /><Line dataKey="upper" dot={false} name="Upper range" stroke="var(--chart-muted)" strokeDasharray="4 4" /><Line dataKey="lower" dot={false} name="Lower range" stroke="var(--chart-muted)" strokeDasharray="4 4" /></LineChart></ResponsiveContainer></ChartRegion>;
}

function ForecastPanel({ forecast, days, onDaysChange, title, unit, currency }: { forecast: ForecastResponse | null; days: number; onDaysChange: (days: number) => void; title: string; unit: MeasurementUnit; currency: CurrencyPreference }) {
  return <section className="panel"><div className="panel-heading"><div><h3>{title}</h3><p>{forecast?.method.replaceAll("_", " ") ?? "Model unavailable"}</p></div><div aria-label="Forecast horizon" className="segmented" role="group">{[7, 14, 30].map((option) => <button aria-pressed={days === option} className={days === option ? "active" : ""} key={option} onClick={() => onDaysChange(option)} type="button">{option}d</button>)}</div></div><div className="forecast-summary"><span>{forecast?.summary ?? "Forecast unavailable"}</span><small>MAE {formatMeasurement(forecast?.metrics.mae, unit, currency)} | RMSE {formatMeasurement(forecast?.metrics.rmse, unit, currency)}</small></div><ForecastChart currency={currency} forecast={forecast} label={`${title} chart`} unit={unit} /></section>;
}

function AnomalyPanel({ anomalies, currency }: { anomalies: Anomaly[]; currency: CurrencyPreference }) {
  const columns: ResponsiveColumn<Anomaly>[] = [
    { key: "time", label: "Time", render: (item) => item.timestamp ? new Date(item.timestamp).toLocaleDateString() : "Unknown" },
    { key: "asset", label: "Asset", render: (item) => item.asset ?? "Fleet" },
    { key: "signal", label: "Signal", render: (item) => <><strong>{item.method.replaceAll("_", " ")}</strong><small className="table-value">{item.possible_explanation}</small><small className="table-value">Actual: {formatMeasurement(item.actual_value, inferUnit(item.metric), currency)}</small></> },
    { key: "severity", label: "Severity", render: (item) => <span className={`severity ${item.severity}`}>{item.severity}</span> }
  ];
  return <section className="panel"><div className="panel-heading"><div><h3>Operational Alerts</h3><p>{anomalies.length} detected events</p></div><AlertTriangle aria-hidden="true" size={20} /></div>{anomalies.length ? <ResponsiveTable caption="Operational anomaly alerts" columns={columns} mobileSummary={(item) => <>{item.asset ?? "Fleet"} | {item.severity}</>} mobileTitle={(item) => item.method.replaceAll("_", " ")} rowKey={(item, index) => `${item.timestamp}-${item.asset}-${item.method}-${item.actual_value}-${index}`} rows={anomalies.slice(0, 7)} /> : <EmptyState icon={<AlertTriangle size={23} />} title="No significant alerts" detail="No high-confidence anomalies were detected in this period." />}</section>;
}

function AskPanel({ question, setQuestion, answer, isAsking, onAsk, suggestions }: { question: string; setQuestion: Dispatch<SetStateAction<string>>; answer: AskResponse | null; isAsking: boolean; onAsk: (event: FormEvent<HTMLFormElement>) => void; suggestions: string[] }) {
  return <section className="panel ask-panel"><div className="panel-heading"><div><h3>Ask Data</h3><p>Verified dataset-wide analysis</p></div><Brain aria-hidden="true" size={20} /></div><form aria-busy={isAsking} className="ask-form" onSubmit={onAsk}><div className="question-row"><Search aria-hidden="true" size={18} /><input aria-label="Ask a question about this dataset" onChange={(event) => setQuestion(event.target.value)} value={question} /><button disabled={isAsking} type="submit">{isAsking ? <><Loader2 aria-hidden="true" className="spin" size={17} />Working</> : "Ask"}</button></div></form>{answer ? <div aria-live="polite" className="answer-box"><div className="answer-meta"><span>{answer.source === "gemini" ? "Gemini assisted" : "Rules analysis"}</span><span>{answer.analysis_period}</span></div><strong>{answer.explanation.what_happened}</strong><dl><dt>Why it matters</dt><dd>{answer.explanation.why_it_matters}</dd><dt>Possible reason</dt><dd>{answer.explanation.possible_reason}</dd><dt>Next step</dt><dd>{answer.explanation.suggested_next_step}</dd></dl></div> : <div className="question-suggestions">{suggestions.map((item) => <button key={item} onClick={() => setQuestion(item)} type="button">{item}</button>)}</div>}</section>;
}

function usePeriodData(data: DashboardData, period: DashboardPeriod) {
  return useMemo(() => {
    const dates = [
      ...(data.charts?.time_series.map((point) => point.date) ?? []),
      ...(data.demand?.daily_demand.map((point) => point.date) ?? []),
      ...data.anomalies.map((item) => item.timestamp)
    ];
    return {
      generation: filterByPeriod(data.charts?.time_series ?? [], (point) => point.date, period, dates),
      demand: filterByPeriod(data.demand?.daily_demand ?? [], (point) => point.date, period, dates),
      peaks: filterByPeriod(data.demand?.peak_periods ?? [], (point) => point.timestamp, period, dates),
      anomalies: filterByPeriod(data.anomalies, (item) => item.timestamp, period, dates)
    };
  }, [data, period]);
}

function GenerationDashboard(props: DomainProps) {
  const { data, dataset, forecastDays, onForecastDays, question, setQuestion, answer, isAsking, onAsk, period, currency } = props;
  const filtered = usePeriodData(data, period);
  const summary = numericSummary(filtered.generation.map((point) => point.value));
  const unit = inferUnit(data.kpis?.value_column, "MWh");
  const periodDetail = period.preset === "all" ? undefined : periodLabel(period);
  const anomalyPoints = filtered.anomalies.filter((item) => item.timestamp).map((item) => ({ date: item.timestamp!.slice(0, 10), anomaly: item.actual_value }));
  return <>
    <div className="domain-context"><div className="domain-context-icon generation"><TrendingUp aria-hidden="true" size={20} /></div><div><strong>Generation performance</strong><span>{data.kpis?.value_column?.replaceAll("_", " ") ?? "Production output"} ({unit})</span></div><small>{periodLabel(period)}</small></div>
    <section aria-label="Generation metrics" className="domain-metrics"><Metric detail={periodDetail} label="Total output" value={formatMeasurement(period.preset === "all" ? data.kpis?.total_output : summary.total, unit, currency)} /><Metric detail={periodDetail} label="Average daily" value={formatMeasurement(period.preset === "all" ? data.kpis?.average_daily_output : summary.average, unit, currency)} tone="info" /><Metric detail={periodDetail} label="Peak output" value={formatMeasurement(period.preset === "all" ? data.kpis?.peak_output : summary.peak, unit, currency)} /><Metric detail="Dataset-wide" label="Average efficiency" value={formatMeasurement(data.kpis?.average_efficiency, "%", currency)} tone="info" /><Metric detail="Dataset-wide" label="Capacity factor" value={formatMeasurement(data.kpis?.capacity_factor, "%", currency)} /><Metric detail="Dataset-wide" label="Downtime" value={formatMeasurement(data.kpis?.downtime_hours, "h", currency)} tone={(data.kpis?.downtime_hours ?? 0) > 0 ? "warning" : "default"} /></section>
    <section className="panel"><div className="panel-heading"><div><h3>Output and Anomalies</h3><p>{periodLabel(period)}</p></div><Gauge aria-hidden="true" size={20} /></div>{filtered.generation.length ? <ChartRegion label={`Generation output for ${periodLabel(period)}`} summary={`${filtered.generation.length} dated production points. Peak ${formatMeasurement(summary.peak, unit, currency)}.`}><ResponsiveContainer height={310} width="100%"><ComposedChart accessibilityLayer data={filtered.generation}><CartesianGrid stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="date" minTickGap={28} tickLine={false} /><YAxis tickLine={false} /><Tooltip formatter={(value) => formatMeasurement(Number(value), unit, currency)} /><Legend /><Area dataKey="value" fill="var(--generation-fill)" name={`Output (${unit})`} stroke="var(--green)" strokeWidth={2} type="monotone" /><Scatter data={anomalyPoints} dataKey="anomaly" fill="var(--red)" name="Anomaly" /></ComposedChart></ResponsiveContainer></ChartRegion> : <EmptyState title="No production in this period" detail="Choose a wider analysis period or verify that a timestamp column is available." />}</section>
    <section className="dashboard-two-column">
      <section className="panel"><div className="panel-heading"><div><h3>Asset Performance</h3><p>{dataset.asset_column?.replaceAll("_", " ") ?? "Detected assets"}</p></div><BarChart3 aria-hidden="true" size={20} /></div>{data.charts?.asset_comparison.length ? <ChartRegion label="Generation output by asset" summary={`${data.charts.asset_comparison.length} assets ranked by total output.`}><ResponsiveContainer height={286} width="100%"><BarChart accessibilityLayer data={data.charts.asset_comparison} layout="vertical" margin={{ left: 20 }}><CartesianGrid stroke="var(--chart-grid)" horizontal={false} /><XAxis type="number" tickLine={false} /><YAxis dataKey="asset" type="category" width={92} tickLine={false} /><Tooltip formatter={(value) => formatMeasurement(Number(value), unit, currency)} /><Bar dataKey="value" fill="var(--green)" name={`Output (${unit})`} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></ChartRegion> : <EmptyState title="No asset breakdown" detail="An asset identifier was not detected in this dataset." />}</section>
      <ForecastPanel currency={currency} days={forecastDays} forecast={data.forecast} onDaysChange={onForecastDays} title="Production Forecast" unit={unit} />
    </section>
    {data.charts?.weather_relationship.length ? <section className="panel"><div className="panel-heading"><div><h3>Weather Relationship</h3><p>Measured weather signal against output</p></div><BarChart3 aria-hidden="true" size={20} /></div><ChartRegion label="Weather relationship scatter plot" summary={`${data.charts.weather_relationship.length} weather and output observations.`}><ResponsiveContainer height={280} width="100%"><ScatterChart accessibilityLayer><CartesianGrid stroke="var(--chart-grid)" /><XAxis dataKey="weather_value" name="Weather" tickLine={false} /><YAxis dataKey="output" name={`Output (${unit})`} tickLine={false} /><Tooltip /><Scatter data={data.charts.weather_relationship} fill="var(--blue)" /></ScatterChart></ResponsiveContainer></ChartRegion></section> : null}
    <section className="dashboard-two-column lower"><AnomalyPanel anomalies={filtered.anomalies} currency={currency} /><AskPanel answer={answer} isAsking={isAsking} onAsk={onAsk} question={question} setQuestion={setQuestion} suggestions={["Which asset is underperforming?", "Which day had the largest production drop?", "What factors relate to low production?"]} /></section>
  </>;
}

function DemandDashboard(props: DomainProps) {
  const { data, dataset, forecastDays, onForecastDays, question, setQuestion, answer, isAsking, onAsk, period, currency } = props;
  const demand = data.demand;
  const filtered = usePeriodData(data, period);
  const summary = numericSummary(filtered.demand.map((point) => point.value));
  const unit = inferUnit(demand?.demand_column, "MW");
  const loadFactor = summary.peak && summary.average !== null ? summary.average / summary.peak * 100 : null;
  const peakColumns: ResponsiveColumn<{ timestamp: string; demand: number }>[] = [
    { key: "time", label: "Timestamp", render: (item) => new Date(item.timestamp).toLocaleString() },
    { key: "demand", label: `Demand (${unit})`, render: (item) => <strong>{formatMeasurement(item.demand, unit, currency)}</strong> }
  ];
  return <>
    <div className="domain-context"><div className="domain-context-icon demand"><Gauge aria-hidden="true" size={20} /></div><div><strong>Demand operations</strong><span>{demand?.demand_column?.replaceAll("_", " ") ?? "Energy demand"} ({unit})</span></div><small>{periodLabel(period)}</small></div>
    <section aria-label="Demand metrics" className="domain-metrics"><Metric label="Total consumption" value={formatMeasurement(period.preset === "all" ? demand?.total_consumption : summary.total, unit, currency)} /><Metric label="Peak demand" value={formatMeasurement(period.preset === "all" ? demand?.peak_demand : summary.peak, unit, currency)} tone="critical" /><Metric label="Average demand" value={formatMeasurement(period.preset === "all" ? demand?.average_demand : summary.average, unit, currency)} tone="info" /><Metric label="Load factor" value={formatMeasurement(period.preset === "all" ? demand?.load_factor : loadFactor, "%", currency)} /><Metric label="Demand variability" value={formatMeasurement(period.preset === "all" ? demand?.demand_variability : summary.variability, "%", currency)} tone="warning" /><Metric detail="Dataset-wide" label="Missing data" value={formatMeasurement(data.kpis?.missing_data_percentage, "%", currency)} /></section>
    <section className="panel"><div className="panel-heading"><div><h3>Daily Demand Profile</h3><p>{periodLabel(period)}</p></div><TrendingUp aria-hidden="true" size={20} /></div>{filtered.demand.length ? <ChartRegion label={`Daily demand for ${periodLabel(period)}`} summary={`${filtered.demand.length} daily values. Peak ${formatMeasurement(summary.peak, unit, currency)}.`}><ResponsiveContainer height={310} width="100%"><LineChart accessibilityLayer data={filtered.demand}><CartesianGrid stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="date" minTickGap={28} tickLine={false} /><YAxis tickLine={false} /><Tooltip formatter={(value) => formatMeasurement(Number(value), unit, currency)} /><Line dataKey="value" dot={false} name={`Demand (${unit})`} stroke="var(--blue)" strokeWidth={2} /></LineChart></ResponsiveContainer></ChartRegion> : <EmptyState title="No demand in this period" detail="Choose a wider analysis period or verify the dataset timestamp mapping." />}</section>
    <section className="dashboard-two-column">
      <ForecastPanel currency={currency} days={forecastDays} forecast={demand?.forecast ?? null} onDaysChange={onForecastDays} title="Demand Forecast" unit={unit} />
      <section className="panel"><div className="panel-heading"><div><h3>Peak Periods</h3><p>Highest measured demand intervals</p></div><AlertTriangle aria-hidden="true" size={20} /></div>{filtered.peaks.length ? <ResponsiveTable caption="Peak demand periods" columns={peakColumns} mobileSummary={(item) => formatMeasurement(item.demand, unit, currency)} mobileTitle={(item) => new Date(item.timestamp).toLocaleDateString()} rowKey={(item) => item.timestamp} rows={filtered.peaks} /> : <EmptyState title="No peak periods" detail="No peak demand intervals fall inside the selected period." />}</section>
    </section>
    <section className="dashboard-two-column lower"><AnomalyPanel anomalies={filtered.anomalies} currency={currency} /><AskPanel answer={answer} isAsking={isAsking} onAsk={onAsk} question={question} setQuestion={setQuestion} suggestions={["When does peak demand occur?", "Forecast demand for the next 14 days", "Which periods have unusual demand?"]} /></section>
  </>;
}

function MaintenanceDashboard(props: DomainProps) {
  const { data, question, setQuestion, answer, isAsking, onAsk, period, currency } = props;
  const maintenance = data.maintenance;
  const filtered = usePeriodData(data, period);
  const report = data.summary?.cleaning_report as CleaningReport | undefined;
  const mapping = report?.columns_used_for_analysis ?? {};
  const workOrderColumns = [mapping.work_order_column, mapping.asset_column, mapping.maintenance_type_column, mapping.status_column, mapping.duration_column, mapping.cost_column].filter((column): column is string => typeof column === "string");
  const reliabilityColumns: ResponsiveColumn<NonNullable<MaintenanceAnalysis>["asset_reliability"][number]>[] = [
    { key: "asset", label: "Asset", render: (item) => <strong>{item.asset}</strong> },
    { key: "events", label: "Events", render: (item) => item.events },
    { key: "downtime", label: "Downtime", render: (item) => formatMeasurement(item.downtime_hours, "h", currency) },
    { key: "cost", label: `Cost (${currency})`, render: (item) => formatMeasurement(item.cost, "currency", currency) }
  ];
  const workOrderRows = data.summary?.sample_rows.slice(0, 8) ?? [];
  const sampleColumns: ResponsiveColumn<Record<string, unknown>>[] = workOrderColumns.map((column) => ({ key: column, label: column.replaceAll("_", " "), render: (row) => {
    const unit = inferUnit(column);
    const value = row[column];
    return typeof value === "number" && unit !== "none" ? formatMeasurement(value, unit, currency) : String(value ?? "Not available");
  } }));
  return <>
    <div className="domain-context"><div className="domain-context-icon maintenance"><Wrench aria-hidden="true" size={20} /></div><div><strong>Maintenance operations</strong><span>Work orders and asset reliability</span></div><small>{period.preset === "all" ? "Dataset-wide" : `${periodLabel(period)} alerts`}</small></div>
    {period.preset !== "all" ? <div className="scope-notice" role="note">Maintenance KPIs are dataset-wide. The selected period is applied to dated alerts because work-order aggregates do not expose a complete dated series.</div> : null}
    <section aria-label="Maintenance metrics" className="domain-metrics"><Metric label="Maintenance events" value={formatMeasurement(maintenance?.maintenance_events, "count", currency, 0)} /><Metric label="Open work orders" value={formatMeasurement(maintenance?.open_work_orders, "count", currency, 0)} tone={(maintenance?.open_work_orders ?? 0) > 0 ? "warning" : "default"} /><Metric label="Average repair time" value={formatMeasurement(maintenance?.average_repair_hours, "h", currency)} tone="info" /><Metric label={`Recorded cost (${currency})`} value={formatMeasurement(maintenance?.maintenance_cost, "currency", currency)} /><Metric label="Availability" value={formatMeasurement(maintenance?.availability_percentage, "%", currency)} tone="info" /><Metric label="Total downtime" value={formatMeasurement(maintenance?.total_downtime_hours, "h", currency)} tone="critical" /></section>
    <section className="dashboard-two-column">
      <section className="panel"><div className="panel-heading"><div><h3>Events by Type</h3><p>Maintenance activity distribution</p></div><Settings aria-hidden="true" size={20} /></div>{maintenance?.events_by_type.length ? <ChartRegion label="Maintenance events by type" summary={`${maintenance.events_by_type.length} maintenance categories.`}><ResponsiveContainer height={300} width="100%"><BarChart accessibilityLayer data={maintenance.events_by_type}><CartesianGrid stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="type" tickLine={false} /><YAxis allowDecimals={false} tickLine={false} /><Tooltip /><Bar dataKey="events" fill="var(--amber)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></ChartRegion> : <EmptyState title="No event categories" detail="A maintenance type column was not detected." />}</section>
      <section className="panel"><div className="panel-heading"><div><h3>Asset Reliability</h3><p>Assets ordered by downtime and events</p></div><Wrench aria-hidden="true" size={20} /></div>{maintenance?.asset_reliability.length ? <ResponsiveTable caption="Asset maintenance reliability" columns={reliabilityColumns} mobileSummary={(item) => `${item.events} events | ${formatMeasurement(item.downtime_hours, "h", currency)}`} mobileTitle={(item) => item.asset} rowKey={(item) => item.asset} rows={maintenance.asset_reliability.slice(0, 10)} /> : <EmptyState title="No asset mapping" detail="An asset identifier was not detected in the maintenance log." />}</section>
    </section>
    {workOrderRows.length && sampleColumns.length ? <section className="panel"><div className="panel-heading"><div><h3>Recent Work Orders</h3><p>Cleaned maintenance records</p></div><Wrench aria-hidden="true" size={20} /></div><ResponsiveTable caption="Recent maintenance work orders" columns={sampleColumns} mobileSummary={(row) => String(row[mapping.status_column as string] ?? "Maintenance record")} mobileTitle={(row) => String(row[mapping.work_order_column as string] ?? row[mapping.asset_column as string] ?? "Work order")} rowKey={(row) => workOrderColumns.map((column) => String(row[column] ?? "")).join("-")} rows={workOrderRows} /></section> : null}
    <section className="dashboard-two-column lower"><AnomalyPanel anomalies={filtered.anomalies} currency={currency} /><AskPanel answer={answer} isAsking={isAsking} onAsk={onAsk} question={question} setQuestion={setQuestion} suggestions={["Which asset has the most downtime?", "How many work orders are still open?", "Which maintenance type costs the most?"]} /></section>
  </>;
}

function CombinedDashboard(props: DomainProps) {
  const { data, dataset, forecastDays, onForecastDays, question, setQuestion, answer, isAsking, onAsk, period, currency } = props;
  const filtered = usePeriodData(data, period);
  const generationUnit = inferUnit(data.kpis?.value_column, "MWh");
  const demandUnit = inferUnit(data.demand?.demand_column, "MW");
  const generationSummary = numericSummary(filtered.generation.map((point) => point.value));
  const demandSummary = numericSummary(filtered.demand.map((point) => point.value));
  const combinedRows = useMemo(() => {
    const byDate = new Map<string, { date: string; generation: number | null; demand: number | null }>();
    filtered.generation.forEach((point) => byDate.set(point.date, { date: point.date, generation: point.value, demand: byDate.get(point.date)?.demand ?? null }));
    filtered.demand.forEach((point) => byDate.set(point.date, { date: point.date, generation: byDate.get(point.date)?.generation ?? null, demand: point.value }));
    return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
  }, [filtered.demand, filtered.generation]);
  const balance = generationUnit === demandUnit && generationSummary.total !== null && demandSummary.total !== null ? generationSummary.total - demandSummary.total : null;
  return <>
    <div className="domain-context combined-context"><div className="domain-context-icon combined"><Zap aria-hidden="true" size={20} /></div><div><strong>Generation and demand balance</strong><span>{dataset.value_column?.replaceAll("_", " ") ?? "Generation"} against {data.demand?.demand_column?.replaceAll("_", " ") ?? "demand"}</span></div><small>{periodLabel(period)}</small></div>
    <section aria-label="Combined generation and demand metrics" className="domain-metrics"><Metric label="Generation total" value={formatMeasurement(generationSummary.total ?? data.kpis?.total_output, generationUnit, currency)} /><Metric label="Generation peak" value={formatMeasurement(generationSummary.peak ?? data.kpis?.peak_output, generationUnit, currency)} tone="info" /><Metric label="Consumption total" value={formatMeasurement(demandSummary.total ?? data.demand?.total_consumption, demandUnit, currency)} /><Metric label="Peak demand" value={formatMeasurement(demandSummary.peak ?? data.demand?.peak_demand, demandUnit, currency)} tone="critical" /><Metric label="Load factor" value={formatMeasurement(data.demand?.load_factor, "%", currency)} tone="warning" /><Metric detail={balance === null ? "Requires matching units" : "Generation minus consumption"} label="Energy balance" value={formatMeasurement(balance, generationUnit, currency)} tone={balance !== null && balance < 0 ? "critical" : "info"} /></section>
    <section className="panel"><div className="panel-heading"><div><h3>Supply and Demand</h3><p>{periodLabel(period)}</p></div><Zap aria-hidden="true" size={20} /></div>{combinedRows.length ? <ChartRegion label={`Generation and demand for ${periodLabel(period)}`} summary={`${combinedRows.length} dated observations comparing supply and demand.`}><ResponsiveContainer height={330} width="100%"><ComposedChart accessibilityLayer data={combinedRows}><CartesianGrid stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="date" minTickGap={28} tickLine={false} /><YAxis yAxisId="generation" tickLine={false} /><YAxis orientation="right" yAxisId="demand" tickLine={false} /><Tooltip /><Legend /><Area dataKey="generation" fill="var(--generation-fill)" name={`Generation (${generationUnit})`} stroke="var(--green)" strokeWidth={2} type="monotone" yAxisId="generation" /><Line dataKey="demand" dot={false} name={`Demand (${demandUnit})`} stroke="var(--blue)" strokeWidth={2} yAxisId="demand" /></ComposedChart></ResponsiveContainer></ChartRegion> : <EmptyState title="No overlapping dated data" detail="Generation and demand require dated observations for a combined trend." />}</section>
    <section className="dashboard-two-column"><ForecastPanel currency={currency} days={forecastDays} forecast={data.forecast} onDaysChange={onForecastDays} title="Generation Forecast" unit={generationUnit} /><ForecastPanel currency={currency} days={forecastDays} forecast={data.demand?.forecast ?? null} onDaysChange={onForecastDays} title="Demand Forecast" unit={demandUnit} /></section>
    <section className="dashboard-two-column lower"><AnomalyPanel anomalies={filtered.anomalies} currency={currency} /><AskPanel answer={answer} isAsking={isAsking} onAsk={onAsk} question={question} setQuestion={setQuestion} suggestions={["When does demand exceed generation?", "What is the generation forecast?", "Which periods show the largest supply gap?"]} /></section>
  </>;
}

type DomainProps = {
  data: DashboardData;
  dataset: Dataset;
  forecastDays: number;
  onForecastDays: (days: number) => void;
  question: string;
  setQuestion: Dispatch<SetStateAction<string>>;
  answer: AskResponse | null;
  isAsking: boolean;
  onAsk: (event: FormEvent<HTMLFormElement>) => void;
  period: DashboardPeriod;
  onPeriodChange: (period: DashboardPeriod) => void;
  currency: CurrencyPreference;
};

export function DomainDashboard(props: DomainProps) {
  let dashboard: ReactNode;
  if (props.dataset.dataset_type === "maintenance") dashboard = <MaintenanceDashboard {...props} />;
  else if (props.dataset.dataset_type === "demand") dashboard = <DemandDashboard {...props} />;
  else if (props.dataset.dataset_type === "generation_and_demand") dashboard = <CombinedDashboard {...props} />;
  else dashboard = <GenerationDashboard {...props} />;
  return <><DashboardPeriodControl onChange={props.onPeriodChange} period={props.period} />{dashboard}</>;
}
