from typing import Any

import numpy as np
import pandas as pd

MAX_ANOMALY_ANALYSIS_ROWS = 25_000


def _severity(score: float) -> str:
    if score >= 4:
        return "high"
    if score >= 2.8:
        return "medium"
    return "low"


def _statistical_explanation(value: float, low: float, high: float, method: str) -> str:
    direction = "below" if value < low else "above" if value > high else "outside"
    labels = {
        "z_score": "its statistical distribution",
        "rolling_average": "the recent rolling average",
        "isolation_forest": "the multivariable operating pattern",
    }
    comparison = labels.get(method, "the expected operating pattern")
    return (
        f"Output is {direction} the expected range compared with {comparison}. "
        "Review the matching weather, status, and maintenance records before assigning a cause."
    )


def _expected_range(values: pd.Series) -> tuple[float, float]:
    first_quartile = float(values.quantile(0.25))
    third_quartile = float(values.quantile(0.75))
    spread = max(third_quartile - first_quartile, float(values.std() or 0) * 0.5, 1e-9)
    return max(0.0, first_quartile - 1.5 * spread), third_quartile + 1.5 * spread


def _telemetry_gap_events(
    working: pd.DataFrame,
    datetime_column: str | None,
    asset_column: str | None,
    value_column: str,
    expected_range: tuple[float, float],
) -> list[dict[str, Any]]:
    if not datetime_column or datetime_column not in working.columns:
        return []

    gap_events: list[dict[str, Any]] = []
    groups = working.groupby(asset_column, dropna=False) if asset_column and asset_column in working.columns else [(None, working)]
    for asset, group in groups:
        timestamps = pd.to_datetime(group[datetime_column], errors="coerce").dropna().drop_duplicates().sort_values()
        deltas = timestamps.diff().dropna()
        positive_deltas = deltas[deltas > pd.Timedelta(0)]
        if len(positive_deltas) < 2:
            continue
        expected_interval = positive_deltas.median()
        if expected_interval <= pd.Timedelta(0):
            continue
        for current_index, delta in positive_deltas.items():
            if delta <= expected_interval * 1.5:
                continue
            current_position = timestamps.index.get_loc(current_index)
            previous_timestamp = timestamps.iloc[current_position - 1]
            missing_timestamp = previous_timestamp + expected_interval
            estimated_missing = max(int(round(delta / expected_interval)) - 1, 1)
            gap_events.append(
                {
                    "timestamp": missing_timestamp.isoformat(),
                    "asset": None if asset is None or pd.isna(asset) else str(asset),
                    "metric": value_column,
                    "actual_value": 0.0,
                    "expected_range": tuple(round(item, 2) for item in expected_range),
                    "severity": "medium" if estimated_missing < 4 else "high",
                    "method": "telemetry_gap",
                    "possible_explanation": (
                        f"Approximately {estimated_missing} expected telemetry interval(s) are absent. "
                        "Check data ingestion and device connectivity before treating this as zero production."
                    ),
                    "_score": min(3.0 + estimated_missing * 0.25, 5.0),
                }
            )
    return gap_events


def detect_anomalies(frame: pd.DataFrame, profile: dict[str, Any], limit: int = 50) -> list[dict[str, Any]]:
    value_column = profile.get("value_column")
    datetime_column = profile.get("datetime_column")
    asset_column = profile.get("asset_column")
    weather_columns = profile.get("weather_columns") or []
    weather_column = next((column for column in weather_columns if column in frame.columns), None)
    if not value_column or value_column not in frame.columns:
        return []

    sampled = len(frame) > MAX_ANOMALY_ANALYSIS_ROWS
    if sampled:
        sample_indexes = np.linspace(0, len(frame) - 1, MAX_ANOMALY_ANALYSIS_ROWS, dtype=int)
        working = frame.iloc[sample_indexes].copy()
    else:
        working = frame.copy()
    working[value_column] = pd.to_numeric(working[value_column], errors="coerce")
    if datetime_column and datetime_column in working.columns:
        working[datetime_column] = pd.to_datetime(working[datetime_column], errors="coerce")
        sort_columns = [column for column in (asset_column, datetime_column) if column and column in working.columns]
        working = working.sort_values(sort_columns, kind="stable")
    working = working.dropna(subset=[value_column]).reset_index(drop=True)
    if working.empty:
        return []

    values = working[value_column]
    expected_low, expected_high = _expected_range(values)
    candidates: dict[int, tuple[float, str, str]] = {}

    def add_candidate(index: int, score: float, method: str, explanation: str) -> None:
        current = candidates.get(index)
        if current is None or score > current[0]:
            candidates[index] = (score, method, explanation)

    mean = values.mean()
    std = float(values.std() or 0)
    if std and not np.isnan(std):
        z_scores = ((values - mean) / std).abs()
        for index, score in z_scores[z_scores >= 2.5].nlargest(limit * 3).items():
            add_candidate(
                int(index),
                float(score),
                "z_score",
                _statistical_explanation(float(values.loc[index]), expected_low, expected_high, "z_score"),
            )

    if len(working) >= 8:
        window = min(7, max(3, len(values) // 5))
        rolling_average = values.rolling(window=window, min_periods=3).mean().shift(1)
        residual = (values - rolling_average).abs()
        threshold = residual.dropna().quantile(0.90)
        if pd.notna(threshold) and threshold > 0:
            for index in residual[residual >= threshold].dropna().nlargest(limit * 3).index:
                score = max(float(residual.loc[index] / (std or 1)), 2.6)
                add_candidate(
                    int(index),
                    score,
                    "rolling_average",
                    _statistical_explanation(float(values.loc[index]), expected_low, expected_high, "rolling_average"),
                )

    if len(working) >= 20:
        numeric = working.select_dtypes(include=["number"]).replace([np.inf, -np.inf], np.nan).fillna(0)
        try:
            from sklearn.ensemble import IsolationForest

            contamination = min(0.12, max(0.03, 5 / len(numeric)))
            model = IsolationForest(contamination=contamination, random_state=42, n_jobs=-1)
            labels = model.fit_predict(numeric)
            candidate_indexes = np.flatnonzero(labels == -1)
            if len(candidate_indexes):
                scores = pd.Series(-model.score_samples(numeric.iloc[candidate_indexes]), index=candidate_indexes)
                for index in scores.nlargest(limit * 3).index:
                    add_candidate(
                        int(index),
                        2.7,
                        "isolation_forest",
                        _statistical_explanation(float(values.iloc[index]), expected_low, expected_high, "isolation_forest"),
                    )
        except (ImportError, ValueError):
            pass

    weather = None
    if weather_column and weather_column in working.columns:
        weather = pd.to_numeric(working[weather_column], errors="coerce")
        good_weather = weather >= weather.quantile(0.65)
        low_output = values <= values.quantile(0.20)
        for index in working.index[good_weather & low_output]:
            add_candidate(
                int(index),
                3.4,
                "good_weather_low_output",
                (
                    f"Output is low even though {weather_column} is in the upper operating range. "
                    "This can indicate curtailment, downtime, soiling, or an equipment issue; verify status and maintenance logs."
                ),
            )

    zero_threshold = max(float(values.max()) * 0.005, 1e-9)
    zero_mask = values <= zero_threshold
    grouping = working[asset_column] if asset_column and asset_column in working.columns else pd.Series("all", index=working.index)
    for _, group_indexes in working.groupby(grouping, sort=False).groups.items():
        group_zero = zero_mask.loc[group_indexes]
        run_ids = group_zero.ne(group_zero.shift()).cumsum()
        for _, run in group_zero[group_zero].groupby(run_ids[group_zero]):
            if len(run) < 2:
                continue
            for index in run.index:
                if weather is not None and weather.loc[index] < weather.quantile(0.50):
                    continue
                add_candidate(
                    int(index),
                    min(3.0 + len(run) * 0.2, 4.5),
                    "repeated_zero_output",
                    (
                        f"Output stayed near zero for {len(run)} consecutive observations. "
                        "Confirm whether this matches planned downtime, low resource conditions, or a telemetry failure."
                    ),
                )

    anomalies: list[dict[str, Any]] = []
    for index, (score, method, explanation) in candidates.items():
        row = working.iloc[index]
        timestamp = None
        if datetime_column and datetime_column in working.columns and pd.notna(row[datetime_column]):
            timestamp = pd.Timestamp(row[datetime_column]).isoformat()
        asset = str(row[asset_column]) if asset_column and asset_column in working.columns else None
        anomalies.append(
            {
                "timestamp": timestamp,
                "asset": asset,
                "metric": str(value_column),
                "actual_value": round(float(row[value_column]), 2),
                "expected_range": (round(expected_low, 2), round(expected_high, 2)),
                "severity": _severity(score),
                "method": method,
                "possible_explanation": explanation,
                "_score": score,
            }
        )

    cleaning_report = profile.get("cleaning_report") or {}
    for event in cleaning_report.get("data_quality_events", [])[:limit]:
        anomalies.append(
            {
                "timestamp": event.get("timestamp"),
                "asset": str(event["asset"]) if event.get("asset") is not None else None,
                "metric": str(value_column),
                "actual_value": 0.0,
                "expected_range": (round(expected_low, 2), round(expected_high, 2)),
                "severity": "medium",
                "method": "missing_telemetry",
                "possible_explanation": event.get("reason", "Output telemetry was missing and repaired during cleaning."),
                "_score": 3.2,
            }
        )

    if not sampled:
        anomalies.extend(
            _telemetry_gap_events(
                working,
                str(datetime_column) if datetime_column else None,
                str(asset_column) if asset_column else None,
                str(value_column),
                (expected_low, expected_high),
            )
        )
    anomalies.sort(
        key=lambda item: ({"high": 3, "medium": 2, "low": 1}[item["severity"]], item["_score"]),
        reverse=True,
    )
    for item in anomalies:
        item.pop("_score", None)
    return anomalies[:limit]
