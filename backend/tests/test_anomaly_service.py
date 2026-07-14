import pandas as pd

from app.services.anomaly_service import detect_anomalies


def test_detect_anomalies_flags_large_drop() -> None:
    frame = pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-01", periods=30, freq="D"),
            "asset": ["INV-1"] * 30,
            "energy": [100, 102, 98, 101, 103, 99, 100, 104, 102, 0, 101, 99, 102, 103, 100, 98, 102, 101, 99, 103, 104, 100, 101, 102, 99, 100, 103, 102, 101, 100],
        }
    )

    anomalies = detect_anomalies(
        frame,
        {"datetime_column": "timestamp", "value_column": "energy", "asset_column": "asset"},
    )

    assert anomalies
    assert any(item["actual_value"] == 0 for item in anomalies)


def test_detect_anomalies_flags_good_weather_and_missing_telemetry() -> None:
    frame = pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-01", periods=24, freq="h"),
            "asset": ["INV-1"] * 24,
            "energy": [100] * 20 + [5, 100, 100, 100],
            "irradiation": [4] * 20 + [9, 4, 4, 4],
        }
    )
    profile = {
        "datetime_column": "timestamp",
        "value_column": "energy",
        "asset_column": "asset",
        "weather_columns": ["irradiation"],
        "cleaning_report": {
            "data_quality_events": [
                {"timestamp": "2026-01-01T12:00:00", "asset": "INV-1", "reason": "Missing output repaired."}
            ]
        },
    }

    anomalies = detect_anomalies(frame, profile)
    methods = {item["method"] for item in anomalies}

    assert "good_weather_low_output" in methods
    assert "missing_telemetry" in methods
