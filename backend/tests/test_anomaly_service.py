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

