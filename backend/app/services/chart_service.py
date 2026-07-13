from typing import Any

import pandas as pd


def _round(value: float | int | None) -> float | None:
    if value is None or pd.isna(value):
        return None
    return round(float(value), 2)


def build_charts(frame: pd.DataFrame, profile: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    value_column = profile.get("value_column")
    datetime_column = profile.get("datetime_column")
    asset_column = profile.get("asset_column")
    weather_columns = profile.get("weather_columns") or []
    if not value_column or value_column not in frame.columns:
        return {"time_series": [], "asset_comparison": [], "monthly_trend": [], "weather_relationship": []}

    working = frame.copy()
    working[value_column] = pd.to_numeric(working[value_column], errors="coerce")

    time_series: list[dict[str, Any]] = []
    monthly_trend: list[dict[str, Any]] = []
    if datetime_column and datetime_column in working.columns:
        indexed = working.dropna(subset=[datetime_column]).set_index(datetime_column).sort_index()
        daily = indexed[value_column].resample("D").sum()
        time_series = [{"date": index.date().isoformat(), "value": _round(value)} for index, value in daily.items()]
        monthly = indexed[value_column].resample("ME").sum()
        monthly_trend = [{"month": index.strftime("%Y-%m"), "value": _round(value)} for index, value in monthly.items()]

    asset_comparison: list[dict[str, Any]] = []
    if asset_column and asset_column in working.columns:
        grouped = working.groupby(asset_column)[value_column].sum().sort_values(ascending=False)
        asset_comparison = [{"asset": str(index), "value": _round(value)} for index, value in grouped.head(20).items()]

    weather_relationship: list[dict[str, Any]] = []
    weather_column = next((column for column in weather_columns if column in working.columns), None)
    if weather_column:
        sample = working[[weather_column, value_column]].dropna().sample(
            n=min(250, len(working.dropna(subset=[weather_column, value_column]))),
            random_state=42,
        )
        weather_relationship = [
            {"weather_value": _round(row[weather_column]), "output": _round(row[value_column])}
            for _, row in sample.iterrows()
        ]

    return {
        "time_series": time_series,
        "asset_comparison": asset_comparison,
        "monthly_trend": monthly_trend,
        "weather_relationship": weather_relationship,
    }

