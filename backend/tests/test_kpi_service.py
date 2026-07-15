import pandas as pd

from app.services.kpi_service import compute_kpis


def test_compute_kpis_returns_asset_performance() -> None:
    frame = pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-01", periods=4, freq="D"),
            "asset": ["A", "A", "B", "B"],
            "energy": [10, 20, 5, 8],
        }
    )

    result = compute_kpis(
        frame,
        {"datetime_column": "timestamp", "value_column": "energy", "asset_column": "asset"},
    )

    assert result["total_output"] == 43
    assert result["best_performing_asset"]["asset"] == "A"
    assert result["underperforming_asset"]["asset"] == "B"


def test_compute_kpis_uses_unique_timestamps_for_downtime() -> None:
    frame = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(
                [
                    "2026-01-01 00:00",
                    "2026-01-01 00:00",
                    "2026-01-01 01:00",
                    "2026-01-01 01:00",
                    "2026-01-01 02:00",
                    "2026-01-01 02:00",
                ]
            ),
            "asset": ["A", "B", "A", "B", "A", "B"],
            "energy": [0, 10, 12, 11, 13, 12],
        }
    )

    result = compute_kpis(
        frame,
        {"datetime_column": "timestamp", "value_column": "energy", "asset_column": "asset"},
    )

    assert result["downtime_hours"] == 1


def test_compute_kpis_uses_status_and_original_missing_percentage() -> None:
    frame = pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-01", periods=3, freq="h"),
            "energy": [10, 10, 10],
            "status": ["online", "maintenance", "fault"],
        }
    )

    result = compute_kpis(
        frame,
        {
            "datetime_column": "timestamp",
            "value_column": "energy",
            "status_column": "status",
            "original_missing_percentage": 4.25,
        },
    )

    assert result["downtime_hours"] == 2
    assert result["downtime_basis"] == "status:status"
    assert result["missing_data_percentage"] == 4.25
