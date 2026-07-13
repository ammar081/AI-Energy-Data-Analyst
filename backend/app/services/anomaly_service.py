from typing import Any

import numpy as np
import pandas as pd


def _severity(score: float) -> str:
    if score >= 4:
        return "high"
    if score >= 2.8:
        return "medium"
    return "low"


def _explanation(value: float, low: float, high: float, severity: str) -> str:
    if value < low:
        direction = "below"
    elif value > high:
        direction = "above"
    else:
        direction = "outside"
    return f"Output is {direction} the expected operating range. Severity is {severity}; review weather, downtime, and asset status for this period."


def detect_anomalies(frame: pd.DataFrame, profile: dict[str, Any], limit: int = 50) -> list[dict[str, Any]]:
    value_column = profile.get("value_column")
    datetime_column = profile.get("datetime_column")
    asset_column = profile.get("asset_column")
    if not value_column or value_column not in frame.columns:
        return []

    working = frame.copy()
    working[value_column] = pd.to_numeric(working[value_column], errors="coerce")
    working = working.dropna(subset=[value_column]).reset_index(drop=True)
    if working.empty:
        return []
    if datetime_column and datetime_column in working.columns:
        working = working.sort_values(datetime_column).reset_index(drop=True)

    values = working[value_column]
    mean = values.mean()
    std = values.std() or 0
    quantile_low = float(values.quantile(0.10))
    quantile_high = float(values.quantile(0.90))
    expected_low = float(max(0, quantile_low - 1.5 * (quantile_high - quantile_low)))
    expected_high = float(quantile_high + 1.5 * (quantile_high - quantile_low))

    anomaly_indexes: dict[int, tuple[float, str]] = {}
    if std and not np.isnan(std):
        z_scores = ((values - mean) / std).abs()
        for index, score in z_scores[z_scores >= 2.5].items():
            anomaly_indexes[int(index)] = (float(score), "z_score")

    if len(working) >= 8:
        rolling = values.rolling(window=min(7, max(3, len(values) // 5)), min_periods=3).median()
        residual = (values - rolling).abs()
        threshold = residual.quantile(0.92)
        if threshold and not np.isnan(threshold):
            for index in residual[residual >= threshold].dropna().index:
                current_score = float(residual.loc[index] / (values.std() or 1))
                previous = anomaly_indexes.get(int(index), (0.0, "rolling_median"))
                anomaly_indexes[int(index)] = (max(previous[0], current_score), previous[1])

    if len(working) >= 20:
        numeric = working.select_dtypes(include=["number"]).fillna(0)
        if value_column in numeric.columns and numeric.shape[1] > 0:
            try:
                from sklearn.ensemble import IsolationForest

                contamination = min(0.12, max(0.03, 5 / len(numeric)))
                model = IsolationForest(contamination=contamination, random_state=42)
                labels = model.fit_predict(numeric)
                for index, label in enumerate(labels):
                    if label == -1:
                        previous = anomaly_indexes.get(index, (2.7, "isolation_forest"))
                        anomaly_indexes[index] = (max(previous[0], 2.7), "isolation_forest")
            except Exception:
                pass

    zero_mask = values <= max(values.quantile(0.03), 0)
    for index in values[zero_mask].index:
        previous = anomaly_indexes.get(int(index), (2.6, "low_output"))
        anomaly_indexes[int(index)] = (max(previous[0], 2.6), "low_output")

    anomalies: list[dict[str, Any]] = []
    for index, (score, method) in anomaly_indexes.items():
        row = working.iloc[index]
        value = float(row[value_column])
        severity = _severity(score)
        timestamp = None
        if datetime_column and datetime_column in working.columns and pd.notna(row[datetime_column]):
            timestamp = pd.Timestamp(row[datetime_column]).isoformat()
        asset = str(row[asset_column]) if asset_column and asset_column in working.columns else None
        anomalies.append(
            {
                "timestamp": timestamp,
                "asset": asset,
                "metric": str(value_column),
                "actual_value": round(value, 2),
                "expected_range": (round(expected_low, 2), round(expected_high, 2)),
                "severity": severity,
                "method": method,
                "possible_explanation": _explanation(value, expected_low, expected_high, severity),
                "_score": score,
            }
        )

    anomalies.sort(key=lambda item: ({"high": 3, "medium": 2, "low": 1}[item["severity"]], item["_score"]), reverse=True)
    for item in anomalies:
        item.pop("_score", None)
    return anomalies[:limit]
