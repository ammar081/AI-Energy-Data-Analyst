import numpy as np
import pandas as pd

from app.services.forecast_service import forecast_output


def test_forecast_uses_holt_winters_for_sufficient_history() -> None:
    dates = pd.date_range("2026-01-01", periods=42, freq="D")
    values = 100 + np.arange(42) * 0.5 + np.tile([0, 4, 8, 3, -2, -5, -3], 6)
    frame = pd.DataFrame({"timestamp": dates, "energy": values})

    result = forecast_output(frame, {"datetime_column": "timestamp", "value_column": "energy"}, 14)

    assert result["method"] == "holt_winters_additive"
    assert len(result["forecast"]) == 14
    assert result["metrics"]["mae"] is not None
    assert all(point["lower_bound"] <= point["predicted_value"] <= point["upper_bound"] for point in result["forecast"])
