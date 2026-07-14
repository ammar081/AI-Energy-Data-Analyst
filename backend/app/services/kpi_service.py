from typing import Any

import numpy as np
import pandas as pd


def _round(value: float | int | None, digits: int = 2) -> float | None:
    if value is None or pd.isna(value):
        return None
    return round(float(value), digits)


def _infer_interval_hours(frame: pd.DataFrame, datetime_column: str | None) -> float:
    if not datetime_column or datetime_column not in frame.columns or len(frame) < 2:
        return 1.0
    timestamps = pd.to_datetime(frame[datetime_column], errors="coerce").dropna().drop_duplicates().sort_values()
    deltas = timestamps.diff().dropna()
    deltas = deltas[deltas > pd.Timedelta(0)]
    if deltas.empty:
        return 1.0
    hours = deltas.median().total_seconds() / 3600
    return max(float(hours), 1 / 60)


def compute_kpis(frame: pd.DataFrame, profile: dict[str, Any]) -> dict[str, Any]:
    value_column = profile.get("value_column")
    datetime_column = profile.get("datetime_column")
    asset_column = profile.get("asset_column")
    capacity_column = profile.get("capacity_column")
    status_column = profile.get("status_column")
    missing_percentage = _round(float(profile.get("original_missing_percentage") or 0)) or 0

    if not value_column or value_column not in frame.columns:
        return {
            "value_column": None,
            "datetime_column": datetime_column,
            "total_output": 0,
            "average_daily_output": None,
            "peak_output": None,
            "lowest_output": None,
            "capacity_factor": None,
            "downtime_hours": None,
            "downtime_basis": "not_available",
            "missing_data_percentage": missing_percentage,
            "best_performing_asset": None,
            "underperforming_asset": None,
            "asset_performance": [],
        }

    values = pd.to_numeric(frame[value_column], errors="coerce")
    total_output = _round(values.sum(skipna=True))
    peak_output = _round(values.max(skipna=True))
    lowest_output = _round(values.min(skipna=True))

    average_daily_output = None
    if datetime_column and datetime_column in frame.columns:
        daily = (
            frame.assign(**{value_column: values})
            .dropna(subset=[datetime_column])
            .set_index(datetime_column)[value_column]
            .resample("D")
            .sum()
        )
        average_daily_output = _round(daily.mean()) if not daily.empty else None

    interval_hours = _infer_interval_hours(frame, datetime_column if isinstance(datetime_column, str) else None)
    downtime_basis = "low_output_estimate"
    if status_column and status_column in frame.columns:
        down_statuses = {"down", "offline", "fault", "failed", "stopped", "maintenance", "inactive"}
        normalized_status = frame[status_column].astype(str).str.strip().str.lower()
        downtime_hours = _round(float(normalized_status.isin(down_statuses).sum()) * interval_hours)
        downtime_basis = f"status:{status_column}"
    else:
        max_value = float(values.max(skipna=True) or 0)
        zero_threshold = max(max_value * 0.01, 1e-9)
        downtime_hours = _round(float((values <= zero_threshold).sum()) * interval_hours)

    capacity_factor = None
    if capacity_column and capacity_column in frame.columns and pd.api.types.is_numeric_dtype(frame[capacity_column]):
        capacity = frame[capacity_column].replace(0, np.nan).median()
        if capacity and not pd.isna(capacity):
            capacity_factor = _round((values.mean(skipna=True) / capacity) * 100)

    asset_performance: list[dict[str, Any]] = []
    best_asset = None
    worst_asset = None
    if asset_column and asset_column in frame.columns:
        grouped = (
            frame.assign(**{value_column: values})
            .groupby(asset_column, dropna=False)[value_column]
            .agg(total_output="sum", average_output="mean", records="count")
            .reset_index()
            .rename(columns={asset_column: "asset"})
            .sort_values("total_output", ascending=False)
        )
        asset_performance = [
            {
                "asset": str(row["asset"]),
                "total_output": _round(row["total_output"]),
                "average_output": _round(row["average_output"]),
                "records": int(row["records"]),
            }
            for _, row in grouped.iterrows()
        ]
        if asset_performance:
            best_asset = asset_performance[0]
            worst_asset = asset_performance[-1]

    return {
        "value_column": str(value_column),
        "datetime_column": str(datetime_column) if datetime_column else None,
        "total_output": total_output or 0,
        "average_daily_output": average_daily_output,
        "peak_output": peak_output,
        "lowest_output": lowest_output,
        "capacity_factor": capacity_factor,
        "downtime_hours": downtime_hours,
        "downtime_basis": downtime_basis,
        "missing_data_percentage": missing_percentage,
        "best_performing_asset": best_asset,
        "underperforming_asset": worst_asset,
        "asset_performance": asset_performance,
    }
