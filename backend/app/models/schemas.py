from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DatasetOut(BaseModel):
    id: str
    original_filename: str
    row_count: int
    column_count: int
    datetime_column: str | None = None
    value_column: str | None = None
    asset_column: str | None = None
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
    value_column: str | None
    datetime_column: str | None
    total_output: float
    average_daily_output: float | None = None
    peak_output: float | None = None
    lowest_output: float | None = None
    capacity_factor: float | None = None
    downtime_hours: float | None = None
    missing_data_percentage: float
    best_performing_asset: dict[str, Any] | None = None
    underperforming_asset: dict[str, Any] | None = None
    asset_performance: list[dict[str, Any]] = Field(default_factory=list)


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
    data: dict[str, Any]

