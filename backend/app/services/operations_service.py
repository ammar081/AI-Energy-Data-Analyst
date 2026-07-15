from typing import Any

import numpy as np
import pandas as pd

OPEN_STATUSES = {"open", "pending", "scheduled", "in progress", "in_progress", "assigned", "waiting"}
CLOSED_STATUSES = {"closed", "complete", "completed", "resolved", "done"}


def _numeric(frame: pd.DataFrame, column: str | None) -> pd.Series:
    if not column or column not in frame.columns:
        return pd.Series(dtype=float)
    return pd.to_numeric(frame[column], errors="coerce").dropna()


def compute_average_efficiency(frame: pd.DataFrame, profile: dict[str, Any]) -> float | None:
    direct = _numeric(frame, profile.get("efficiency_column"))
    if not direct.empty:
        value = float(direct.mean())
        return round(value * 100 if abs(value) <= 1.5 else value, 2)

    value_column = profile.get("value_column")
    expected_column = profile.get("expected_column")
    capacity_column = profile.get("capacity_column")
    actual = _numeric(frame, value_column)
    denominator_column = expected_column or capacity_column
    denominator = _numeric(frame, denominator_column)
    if actual.empty or denominator.empty:
        return None
    aligned = pd.concat([actual.rename("actual"), denominator.rename("expected")], axis=1).dropna()
    aligned = aligned[aligned["expected"] > 0]
    if aligned.empty:
        return None
    ratios = (aligned["actual"] / aligned["expected"]).replace([np.inf, -np.inf], np.nan).dropna()
    return round(float(ratios.clip(lower=0, upper=2).mean() * 100), 2) if not ratios.empty else None


def analyze_demand(frame: pd.DataFrame, profile: dict[str, Any]) -> dict[str, Any]:
    demand_column = profile.get("demand_column")
    values = _numeric(frame, demand_column)
    if values.empty:
        return {
            "demand_column": None,
            "total_consumption": None,
            "peak_demand": None,
            "average_demand": None,
            "load_factor": None,
            "demand_variability": None,
            "peak_periods": [],
            "daily_demand": [],
        }

    peak = float(values.max())
    average = float(values.mean())
    variability = float(values.std(ddof=0) / average * 100) if average else None
    load_factor = average / peak * 100 if peak else None
    datetime_column = profile.get("datetime_column")
    daily_rows: list[dict[str, Any]] = []
    peak_periods: list[dict[str, Any]] = []
    if datetime_column and datetime_column in frame.columns:
        demand_frame = pd.DataFrame(
            {
                "timestamp": pd.to_datetime(frame[datetime_column], errors="coerce"),
                "demand": pd.to_numeric(frame[demand_column], errors="coerce"),
            }
        ).dropna()
        daily = demand_frame.set_index("timestamp")["demand"].resample("D").sum(min_count=1).dropna()
        daily_rows = [{"date": date.date().isoformat(), "value": round(float(value), 2)} for date, value in daily.tail(90).items()]
        top = demand_frame.nlargest(min(5, len(demand_frame)), "demand")
        peak_periods = [
            {"timestamp": row["timestamp"].isoformat(), "demand": round(float(row["demand"]), 2)}
            for _, row in top.iterrows()
        ]

    return {
        "demand_column": str(demand_column),
        "total_consumption": round(float(values.sum()), 2),
        "peak_demand": round(peak, 2),
        "average_demand": round(average, 2),
        "load_factor": round(load_factor, 2) if load_factor is not None else None,
        "demand_variability": round(variability, 2) if variability is not None else None,
        "peak_periods": peak_periods,
        "daily_demand": daily_rows,
    }


def analyze_maintenance(frame: pd.DataFrame, profile: dict[str, Any]) -> dict[str, Any]:
    work_order_column = profile.get("work_order_column")
    status_column = profile.get("status_column")
    duration_column = profile.get("duration_column")
    cost_column = profile.get("cost_column")
    type_column = profile.get("maintenance_type_column")
    asset_column = profile.get("asset_column")

    events = int(frame[work_order_column].nunique(dropna=True)) if work_order_column and work_order_column in frame else len(frame)
    open_orders = None
    closed_orders = None
    if status_column and status_column in frame:
        statuses = frame[status_column].astype(str).str.strip().str.lower()
        open_orders = int(statuses.isin(OPEN_STATUSES).sum())
        closed_orders = int(statuses.isin(CLOSED_STATUSES).sum())

    durations = _numeric(frame, duration_column)
    costs = _numeric(frame, cost_column)
    by_type: list[dict[str, Any]] = []
    if type_column and type_column in frame:
        grouped = frame.groupby(type_column, dropna=False).size().sort_values(ascending=False).head(12)
        by_type = [{"type": str(name), "events": int(count)} for name, count in grouped.items()]

    asset_reliability: list[dict[str, Any]] = []
    if asset_column and asset_column in frame:
        grouped = frame.groupby(asset_column, dropna=False)
        for asset, rows in grouped:
            item: dict[str, Any] = {"asset": str(asset), "events": int(len(rows))}
            if duration_column and duration_column in rows:
                item["downtime_hours"] = round(float(pd.to_numeric(rows[duration_column], errors="coerce").sum()), 2)
            if cost_column and cost_column in rows:
                item["cost"] = round(float(pd.to_numeric(rows[cost_column], errors="coerce").sum()), 2)
            asset_reliability.append(item)
        asset_reliability.sort(key=lambda item: (item.get("downtime_hours", 0), item["events"]), reverse=True)

    availability = None
    if not durations.empty:
        datetime_column = profile.get("datetime_column")
        observation_hours = 24.0
        if datetime_column and datetime_column in frame:
            timestamps = pd.to_datetime(frame[datetime_column], errors="coerce").dropna()
            if len(timestamps) >= 2:
                observation_hours = max((timestamps.max() - timestamps.min()).total_seconds() / 3600, 24.0)
        asset_count = max(frame[asset_column].nunique(dropna=True), 1) if asset_column and asset_column in frame else 1
        availability = max(0.0, 100 - float(durations.sum()) / (observation_hours * asset_count) * 100)

    return {
        "maintenance_events": events,
        "open_work_orders": open_orders,
        "closed_work_orders": closed_orders,
        "average_repair_hours": round(float(durations.mean()), 2) if not durations.empty else None,
        "total_downtime_hours": round(float(durations.sum()), 2) if not durations.empty else None,
        "maintenance_cost": round(float(costs.sum()), 2) if not costs.empty else None,
        "availability_percentage": round(availability, 2) if availability is not None else None,
        "events_by_type": by_type,
        "asset_reliability": asset_reliability[:20],
    }
