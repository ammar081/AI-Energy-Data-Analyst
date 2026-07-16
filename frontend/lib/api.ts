export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export type Dataset = {
  id: string;
  original_filename: string;
  row_count: number;
  column_count: number;
  datetime_column: string | null;
  value_column: string | null;
  asset_column: string | null;
  dataset_type: "generation" | "demand" | "maintenance" | "generation_and_demand";
  created_at: string | null;
};

export type UploadResponse = {
  dataset: Dataset;
  cleaning_report: Record<string, unknown>;
};

export type SummaryResponse = {
  dataset: Dataset;
  columns: string[];
  dtypes: Record<string, string>;
  missing_values: Record<string, number>;
  sample_rows: Record<string, unknown>[];
  cleaning_report: Record<string, unknown>;
};

export type CleaningReport = {
  original_rows?: number;
  original_columns?: number;
  cleaned_rows?: number;
  cleaned_columns?: number;
  duplicate_rows_removed?: number;
  invalid_timestamps_removed?: number;
  missing_values_before_fill?: number;
  missing_values_after_fill?: number;
  missing_values_fixed?: number;
  negative_values_replaced?: number;
  outlier_cells_detected?: number;
  original_missing_percentage?: number;
  original_missing_values?: Record<string, number>;
  columns_used_for_analysis?: Record<string, string | string[] | null>;
};

export type KPIResponse = {
  metric_type: string;
  value_column: string | null;
  datetime_column: string | null;
  total_output: number;
  average_daily_output: number | null;
  peak_output: number | null;
  lowest_output: number | null;
  capacity_factor: number | null;
  average_efficiency: number | null;
  downtime_hours: number | null;
  downtime_basis: string;
  missing_data_percentage: number;
  best_performing_asset: AssetPerformance | null;
  underperforming_asset: AssetPerformance | null;
  asset_performance: AssetPerformance[];
  peak_demand: number | null;
  average_demand: number | null;
  demand_variability: number | null;
  load_factor: number | null;
  maintenance_events: number | null;
  open_work_orders: number | null;
  average_repair_hours: number | null;
  maintenance_cost: number | null;
  availability_percentage: number | null;
};

export type AssetPerformance = {
  asset: string;
  total_output: number;
  average_output: number;
  records: number;
};

export type ChartResponse = {
  time_series: { date: string; value: number | null }[];
  asset_comparison: { asset: string; value: number | null }[];
  monthly_trend: { month: string; value: number | null }[];
  weather_relationship: { weather_value: number | null; output: number | null }[];
};

export type Anomaly = {
  timestamp: string | null;
  asset: string | null;
  metric: string;
  actual_value: number;
  expected_range: [number, number];
  severity: "low" | "medium" | "high";
  method: string;
  possible_explanation: string;
};

export type ForecastResponse = {
  horizon_days: number;
  value_column: string | null;
  method: string;
  history: { date: string; value: number }[];
  forecast: { date: string; predicted_value: number; lower_bound: number; upper_bound: number }[];
  metrics: { mae: number | null; rmse: number | null };
  summary: string;
};

export type AskResponse = {
  intent: string;
  answer: string;
  source: "gemini" | "rules";
  analysis_period: string;
  explanation: {
    what_happened: string;
    why_it_matters: string;
    possible_reason: string;
    suggested_next_step: string;
  };
  data: Record<string, unknown>;
};

export type UserRole = "admin" | "analyst" | "viewer";

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string | null;
};

export type TokenResponse = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  user: User;
};

export type AdminStats = {
  users: number;
  active_users: number;
  datasets: number;
  reports: number;
  rows_processed: number;
};

export type ComparisonRow = {
  dataset: Dataset;
  metric_type: string;
  primary_metric: string;
  primary_value: number | null;
  total_output: number;
  average_daily_output: number | null;
  peak_output: number | null;
  average_efficiency: number | null;
  capacity_factor: number | null;
  downtime_hours: number | null;
  missing_data_percentage: number;
};

export type ComparisonResponse = {
  datasets: ComparisonRow[];
  ranking_metric: string;
  leader_dataset_id: string | null;
  common_period: string;
};

export type DemandAnalysis = {
  demand_column: string | null;
  total_consumption: number | null;
  peak_demand: number | null;
  average_demand: number | null;
  load_factor: number | null;
  demand_variability: number | null;
  peak_periods: { timestamp: string; demand: number }[];
  daily_demand: { date: string; value: number }[];
  forecast: ForecastResponse | null;
};

export type MaintenanceAnalysis = {
  maintenance_events: number;
  open_work_orders: number | null;
  closed_work_orders: number | null;
  average_repair_hours: number | null;
  total_downtime_hours: number | null;
  maintenance_cost: number | null;
  availability_percentage: number | null;
  events_by_type: { type: string; events: number }[];
  asset_reliability: { asset: string; events: number; downtime_hours?: number; cost?: number }[];
};

export type GeneratedReport = {
  id: string;
  dataset_id: string;
  title: string;
  created_by: string | null;
  created_at: string | null;
};

export type ReportSearchResult = {
  report: GeneratedReport;
  score: number;
  excerpt: string;
};

const TOKEN_KEY = "energy_analyst_access_token";

export function getAccessToken() {
  return typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), 30_000);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: init?.signal ?? timeoutController.signal,
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        ...init?.headers
      }
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
      throw new Error(payload?.detail ?? `Request failed with ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) return response.json() as Promise<T>;
    return response.text() as Promise<T>;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The request took longer than 30 seconds. Try again or use a smaller dataset.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const api = {
  register: (input: { email: string; full_name: string; password: string }) =>
    request<TokenResponse>("/auth/register", { method: "POST", body: JSON.stringify(input) }),
  login: (input: { email: string; password: string }) =>
    request<TokenResponse>("/auth/login", { method: "POST", body: JSON.stringify(input) }),
  me: () => request<User>("/auth/me"),
  listDatasets: () => request<Dataset[]>("/datasets"),
  deleteDataset: (datasetId: string) => request<void>(`/datasets/${datasetId}`, { method: "DELETE" }),
  uploadDataset: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<UploadResponse>("/upload", { method: "POST", body });
  },
  summary: (datasetId: string) => request<SummaryResponse>(`/datasets/${datasetId}/summary`),
  kpis: (datasetId: string) => request<KPIResponse>(`/datasets/${datasetId}/kpis`),
  charts: (datasetId: string) => request<ChartResponse>(`/datasets/${datasetId}/charts`),
  anomalies: (datasetId: string) => request<Anomaly[]>(`/datasets/${datasetId}/anomalies`),
  forecast: (datasetId: string, days: number) => request<ForecastResponse>(`/datasets/${datasetId}/forecast?days=${days}`),
  demand: (datasetId: string, days: number) => request<DemandAnalysis>(`/datasets/${datasetId}/demand?days=${days}`),
  maintenance: (datasetId: string) => request<MaintenanceAnalysis>(`/datasets/${datasetId}/maintenance`),
  compare: (datasetIds: string[]) => {
    const query = datasetIds.map((id) => `dataset_ids=${encodeURIComponent(id)}`).join("&");
    return request<ComparisonResponse>(`/comparison?${query}`);
  },
  ask: (datasetId: string, question: string) =>
    request<AskResponse>(`/datasets/${datasetId}/ask`, {
      method: "POST",
      body: JSON.stringify({ question })
    }),
  reportHtml: (datasetId: string) => request<string>(`/datasets/${datasetId}/report`, { headers: { Accept: "text/html" } }),
  queueReport: (datasetId: string) => request<{ job_id: string; status: string }>(`/datasets/${datasetId}/reports`, { method: "POST" }),
  job: (jobId: string) => request<{ job_id: string; status: string; result: Record<string, string> | null; error: string | null }>(`/jobs/${jobId}`),
  reports: () => request<GeneratedReport[]>("/reports"),
  searchReports: (query: string) => request<ReportSearchResult[]>(`/reports/search?q=${encodeURIComponent(query)}`),
  generatedReportHtml: (reportId: string) => request<string>(`/reports/${reportId}`, { headers: { Accept: "text/html" } }),
  users: () => request<User[]>("/admin/users"),
  updateUser: (userId: string, input: { role?: UserRole; is_active?: boolean }) =>
    request<User>(`/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(input) }),
  adminStats: () => request<AdminStats>("/admin/stats")
};

export function telemetryWebSocketUrl(datasetId: string) {
  const websocketBaseUrl = process.env.NEXT_PUBLIC_WEBSOCKET_BASE_URL
    ?? (API_BASE_URL.startsWith("http") ? API_BASE_URL : "http://localhost:8000/api");
  const url = new URL(websocketBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const apiPath = url.pathname.replace(/\/$/, "");
  url.pathname = `${apiPath}/telemetry/${datasetId}/stream`;
  url.search = "";
  return url.toString();
}

export async function openHtmlDocument(load: () => Promise<string>) {
  const html = await load();
  const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  window.open(blobUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}
