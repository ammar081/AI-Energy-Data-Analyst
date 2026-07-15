from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class DatasetOut(BaseModel):
    id: str
    original_filename: str
    row_count: int
    column_count: int
    datetime_column: str | None = None
    value_column: str | None = None
    asset_column: str | None = None
    dataset_type: str = "generation"
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class UploadResponse(BaseModel):
    dataset: DatasetOut
    cleaning_report: dict[str, Any]


class SummaryResponse(BaseModel):
    dataset: DatasetOut
    columns: list[str]
    dtypes: dict[str, str]
    missing_values: dict[str, int]
    sample_rows: list[dict[str, Any]]
    cleaning_report: dict[str, Any]


class KPIResponse(BaseModel):
    metric_type: str = "generation"
    value_column: str | None
    datetime_column: str | None
    total_output: float
    average_daily_output: float | None = None
    peak_output: float | None = None
    lowest_output: float | None = None
    capacity_factor: float | None = None
    average_efficiency: float | None = None
    downtime_hours: float | None = None
    downtime_basis: str
    missing_data_percentage: float
    best_performing_asset: dict[str, Any] | None = None
    underperforming_asset: dict[str, Any] | None = None
    asset_performance: list[dict[str, Any]] = Field(default_factory=list)
    peak_demand: float | None = None
    average_demand: float | None = None
    demand_variability: float | None = None
    load_factor: float | None = None
    maintenance_events: int | None = None
    open_work_orders: int | None = None
    average_repair_hours: float | None = None
    maintenance_cost: float | None = None
    availability_percentage: float | None = None


class ChartResponse(BaseModel):
    time_series: list[dict[str, Any]]
    asset_comparison: list[dict[str, Any]]
    monthly_trend: list[dict[str, Any]]
    weather_relationship: list[dict[str, Any]]


class AnomalyOut(BaseModel):
    timestamp: str | None
    asset: str | None
    metric: str
    actual_value: float
    expected_range: tuple[float, float]
    severity: str
    method: str
    possible_explanation: str


class ForecastResponse(BaseModel):
    horizon_days: int
    value_column: str | None
    method: str
    history: list[dict[str, Any]]
    forecast: list[dict[str, Any]]
    metrics: dict[str, float | None]
    summary: str


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)


class AskResponse(BaseModel):
    intent: str
    answer: str
    source: str
    analysis_period: str
    explanation: dict[str, str]
    data: dict[str, Any]


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=10, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: Literal["admin", "analyst", "viewer"]
    is_active: bool
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class UserUpdateRequest(BaseModel):
    role: Literal["admin", "analyst", "viewer"] | None = None
    is_active: bool | None = None


class AdminStatsResponse(BaseModel):
    users: int
    active_users: int
    datasets: int
    reports: int
    rows_processed: int


class ComparisonDataset(BaseModel):
    dataset: DatasetOut
    metric_type: str
    primary_metric: str
    primary_value: float | None = None
    total_output: float
    average_daily_output: float | None = None
    peak_output: float | None = None
    average_efficiency: float | None = None
    capacity_factor: float | None = None
    downtime_hours: float | None = None
    missing_data_percentage: float


class ComparisonResponse(BaseModel):
    datasets: list[ComparisonDataset]
    ranking_metric: str
    leader_dataset_id: str | None = None
    common_period: str


class DemandAnalysisResponse(BaseModel):
    demand_column: str | None
    total_consumption: float | None = None
    peak_demand: float | None = None
    average_demand: float | None = None
    load_factor: float | None = None
    demand_variability: float | None = None
    peak_periods: list[dict[str, Any]] = Field(default_factory=list)
    daily_demand: list[dict[str, Any]] = Field(default_factory=list)
    forecast: ForecastResponse | None = None


class MaintenanceAnalysisResponse(BaseModel):
    maintenance_events: int
    open_work_orders: int | None = None
    closed_work_orders: int | None = None
    average_repair_hours: float | None = None
    total_downtime_hours: float | None = None
    maintenance_cost: float | None = None
    availability_percentage: float | None = None
    events_by_type: list[dict[str, Any]] = Field(default_factory=list)
    asset_reliability: list[dict[str, Any]] = Field(default_factory=list)


class ReportJobResponse(BaseModel):
    job_id: str
    status: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    result: dict[str, Any] | None = None
    error: str | None = None


class GeneratedReportOut(BaseModel):
    id: str
    dataset_id: str
    title: str
    created_by: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class ReportSearchResult(BaseModel):
    report: GeneratedReportOut
    score: float
    excerpt: str
