export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

export type Dataset = {
  id: string;
  original_filename: string;
  row_count: number;
  column_count: number;
  datetime_column: string | null;
  value_column: string | null;
  asset_column: string | null;
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
  value_column: string | null;
  datetime_column: string | null;
  total_output: number;
  average_daily_output: number | null;
  peak_output: number | null;
  lowest_output: number | null;
  capacity_factor: number | null;
  downtime_hours: number | null;
  downtime_basis: string;
  missing_data_percentage: number;
  best_performing_asset: AssetPerformance | null;
  underperforming_asset: AssetPerformance | null;
  asset_performance: AssetPerformance[];
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), 30_000);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: init?.signal ?? timeoutController.signal,
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...init?.headers
      }
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
      throw new Error(payload?.detail ?? `Request failed with ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
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
  ask: (datasetId: string, question: string) =>
    request<AskResponse>(`/datasets/${datasetId}/ask`, {
      method: "POST",
      body: JSON.stringify({ question })
    }),
  reportUrl: (datasetId: string) => `${API_BASE_URL}/datasets/${datasetId}/report`
};
