from typing import Any

import numpy as np
import pandas as pd


def _daily_series(frame: pd.DataFrame, value_column: str, datetime_column: str | None) -> pd.Series:
    values = pd.to_numeric(frame[value_column], errors="coerce")
    if datetime_column and datetime_column in frame.columns:
        series = (
            frame.assign(**{value_column: values})
            .dropna(subset=[datetime_column])
            .set_index(datetime_column)[value_column]
            .resample("D")
            .sum()
            .sort_index()
        )
        return series.interpolate(limit_direction="both").fillna(0)
    index = pd.date_range(end=pd.Timestamp.today().normalize(), periods=len(values), freq="D")
    return pd.Series(values.fillna(values.median()).to_numpy(), index=index)


def forecast_output(frame: pd.DataFrame, profile: dict[str, Any], horizon_days: int = 7) -> dict[str, Any]:
    horizon_days = max(1, min(int(horizon_days), 30))
    value_column = profile.get("value_column")
    datetime_column = profile.get("datetime_column")
    if not value_column or value_column not in frame.columns:
        return {
            "horizon_days": horizon_days,
            "value_column": None,
            "method": "not_available",
            "history": [],
            "forecast": [],
            "metrics": {"mae": None, "rmse": None},
            "summary": "No numeric output column was available for forecasting.",
        }

    series = _daily_series(frame, str(value_column), str(datetime_column) if datetime_column else None)
    series = series[series.notna()]
    if series.empty:
        return {
            "horizon_days": horizon_days,
            "value_column": str(value_column),
            "method": "not_available",
            "history": [],
            "forecast": [],
            "metrics": {"mae": None, "rmse": None},
            "summary": "Not enough clean observations were available for forecasting.",
        }

    x = np.arange(len(series)).reshape(-1, 1)
    y = series.to_numpy(dtype=float)

    method = "linear_regression_with_moving_average_baseline"
    coefficients: np.ndarray | None = None
    mae = None
    rmse = None
    if len(series) >= 8:
        holdout = min(7, max(2, len(series) // 5))
        train_x, test_x = x[:-holdout], x[-holdout:]
        train_y, test_y = y[:-holdout], y[-holdout:]
        train_coefficients = np.polyfit(train_x.ravel(), train_y, deg=1)
        test_pred = np.clip(np.polyval(train_coefficients, test_x.ravel()), 0, None)
        mae = float(np.mean(np.abs(test_y - test_pred)))
        rmse = float(np.sqrt(np.mean((test_y - test_pred) ** 2)))
        coefficients = np.polyfit(x.ravel(), y, deg=1)
    else:
        method = "moving_average_baseline"

    future_index = pd.date_range(series.index.max() + pd.Timedelta(days=1), periods=horizon_days, freq="D")
    if coefficients is not None:
        future_x = np.arange(len(series), len(series) + horizon_days).reshape(-1, 1)
        trend_forecast = np.clip(np.polyval(coefficients, future_x.ravel()), 0, None)
        moving_average = float(series.tail(min(7, len(series))).mean())
        predicted = (trend_forecast * 0.7) + (moving_average * 0.3)
        residuals = y - np.clip(np.polyval(coefficients, x.ravel()), 0, None)
        spread = float(np.std(residuals)) if len(residuals) else float(series.std() or 0)
    else:
        predicted = np.full(horizon_days, float(series.tail(min(5, len(series))).mean()))
        spread = float(series.std() or 0)

    spread = max(spread, float(series.mean() * 0.05), 1.0)
    forecast_rows = []
    for date, value in zip(future_index, predicted, strict=True):
        lower = max(float(value) - 1.64 * spread, 0)
        upper = float(value) + 1.64 * spread
        forecast_rows.append(
            {
                "date": date.date().isoformat(),
                "predicted_value": round(float(value), 2),
                "lower_bound": round(lower, 2),
                "upper_bound": round(upper, 2),
            }
        )

    direction = "stable"
    if len(forecast_rows) >= 2:
        delta = forecast_rows[-1]["predicted_value"] - forecast_rows[0]["predicted_value"]
        if delta > spread * 0.2:
            direction = "upward"
        elif delta < -spread * 0.2:
            direction = "downward"

    return {
        "horizon_days": horizon_days,
        "value_column": str(value_column),
        "method": method,
        "history": [
            {"date": index.date().isoformat(), "value": round(float(value), 2)}
            for index, value in series.tail(60).items()
        ],
        "forecast": forecast_rows,
        "metrics": {
            "mae": round(mae, 2) if mae is not None else None,
            "rmse": round(rmse, 2) if rmse is not None else None,
        },
        "summary": f"The {horizon_days}-day outlook is {direction}, with average predicted output of {round(float(np.mean(predicted)), 2)}.",
    }
