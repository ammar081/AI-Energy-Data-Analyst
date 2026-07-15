from typing import Any

import numpy as np
import pandas as pd


def _daily_series(frame: pd.DataFrame, value_column: str, datetime_column: str | None) -> pd.Series:
    values = pd.to_numeric(frame[value_column], errors="coerce")
    if datetime_column and datetime_column in frame.columns:
        series = (
            frame.assign(**{value_column: values, datetime_column: pd.to_datetime(frame[datetime_column], errors="coerce")})
            .dropna(subset=[datetime_column])
            .set_index(datetime_column)[value_column]
            .resample("D")
            .sum(min_count=1)
            .sort_index()
        )
        return series.interpolate(limit_direction="both").fillna(0)
    index = pd.date_range(end=pd.Timestamp.today().normalize(), periods=len(values), freq="D")
    return pd.Series(values.fillna(values.median()).to_numpy(), index=index)


def _regression_forecast(series: pd.Series, horizon_days: int) -> tuple[np.ndarray, float, str, float | None, float | None]:
    x = np.arange(len(series), dtype=float)
    y = series.to_numpy(dtype=float)
    if len(series) < 8:
        predicted = np.full(horizon_days, float(series.tail(min(5, len(series))).mean()))
        return predicted, float(series.std() or 0), "moving_average_baseline", None, None

    holdout = min(7, max(2, len(series) // 5))
    train_coefficients = np.polyfit(x[:-holdout], y[:-holdout], deg=1)
    test_prediction = np.clip(np.polyval(train_coefficients, x[-holdout:]), 0, None)
    mae = float(np.mean(np.abs(y[-holdout:] - test_prediction)))
    rmse = float(np.sqrt(np.mean((y[-holdout:] - test_prediction) ** 2)))

    coefficients = np.polyfit(x, y, deg=1)
    future_x = np.arange(len(series), len(series) + horizon_days, dtype=float)
    trend = np.clip(np.polyval(coefficients, future_x), 0, None)
    moving_average = float(series.tail(min(7, len(series))).mean())
    predicted = trend * 0.7 + moving_average * 0.3
    residuals = y - np.clip(np.polyval(coefficients, x), 0, None)
    return predicted, float(np.std(residuals)), "linear_regression_with_moving_average_baseline", mae, rmse


def _holt_winters_forecast(
    series: pd.Series, horizon_days: int
) -> tuple[np.ndarray, float, str, float | None, float | None] | None:
    if len(series) < 21:
        return None
    try:
        from statsmodels.tsa.holtwinters import ExponentialSmoothing

        holdout = min(7, max(3, len(series) // 5))
        training = series.iloc[:-holdout]
        seasonal = "add" if len(training) >= 14 else None
        training_fit = ExponentialSmoothing(
            training,
            trend="add",
            seasonal=seasonal,
            seasonal_periods=7 if seasonal else None,
            initialization_method="estimated",
        ).fit(optimized=True)
        validation = np.clip(np.asarray(training_fit.forecast(holdout), dtype=float), 0, None)
        actual = series.iloc[-holdout:].to_numpy(dtype=float)
        mae = float(np.mean(np.abs(actual - validation)))
        rmse = float(np.sqrt(np.mean((actual - validation) ** 2)))

        full_fit = ExponentialSmoothing(
            series,
            trend="add",
            seasonal="add",
            seasonal_periods=7,
            initialization_method="estimated",
        ).fit(optimized=True)
        predicted = np.clip(np.asarray(full_fit.forecast(horizon_days), dtype=float), 0, None)
        spread = float(np.std(np.asarray(full_fit.resid, dtype=float)))
        return predicted, spread, "holt_winters_additive", mae, rmse
    except (ImportError, ValueError, np.linalg.LinAlgError):
        return None


def forecast_output(frame: pd.DataFrame, profile: dict[str, Any], horizon_days: int = 7) -> dict[str, Any]:
    horizon_days = max(1, min(int(horizon_days), 30))
    value_column = profile.get("value_column")
    datetime_column = profile.get("datetime_column")
    metric_label = "demand" if profile.get("dataset_type") == "demand" else "output"
    if not value_column or value_column not in frame.columns:
        return _empty_forecast(horizon_days, None, "No numeric output column was available for forecasting.")

    series = _daily_series(frame, str(value_column), str(datetime_column) if datetime_column else None).dropna()
    if series.empty:
        return _empty_forecast(horizon_days, str(value_column), "Not enough clean observations were available for forecasting.")

    result = _holt_winters_forecast(series, horizon_days)
    if result is None:
        result = _regression_forecast(series, horizon_days)
    predicted, spread, method, mae, rmse = result
    spread = max(spread, float(series.mean() * 0.05), 1.0)
    future_index = pd.date_range(series.index.max() + pd.Timedelta(days=1), periods=horizon_days, freq="D")
    forecast_rows = [
        {
            "date": date.date().isoformat(),
            "predicted_value": round(float(value), 2),
            "lower_bound": round(max(float(value) - 1.64 * spread, 0), 2),
            "upper_bound": round(float(value) + 1.64 * spread, 2),
        }
        for date, value in zip(future_index, predicted, strict=True)
    ]

    direction = "stable"
    if len(predicted) >= 2:
        delta = float(predicted[-1] - predicted[0])
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
        "metrics": {"mae": round(mae, 2) if mae is not None else None, "rmse": round(rmse, 2) if rmse is not None else None},
        "summary": (
            f"The {horizon_days}-day {metric_label} outlook is {direction}, with average predicted {metric_label} of "
            f"{round(float(np.mean(predicted)), 2)} using {method.replace('_', ' ')}."
        ),
    }


def _empty_forecast(horizon_days: int, value_column: str | None, summary: str) -> dict[str, Any]:
    return {
        "horizon_days": horizon_days,
        "value_column": value_column,
        "method": "not_available",
        "history": [],
        "forecast": [],
        "metrics": {"mae": None, "rmse": None},
        "summary": summary,
    }
