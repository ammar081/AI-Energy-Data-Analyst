import pandas as pd

from app.services import report_service


def test_report_contains_required_business_sections(monkeypatch) -> None:
    monkeypatch.setattr(report_service, "generate_executive_report", lambda findings: None)
    frame = pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-01", periods=24, freq="D"),
            "asset": ["A", "B"] * 12,
            "energy": list(range(100, 124)),
        }
    )
    profile = {
        "datetime_column": "timestamp",
        "value_column": "energy",
        "asset_column": "asset",
        "cleaning_report": {
            "original_rows": 25,
            "missing_values_fixed": 1,
            "duplicate_rows_removed": 1,
            "columns_used_for_analysis": {"value_column": "energy", "asset_column": "asset"},
        },
    }

    html = report_service.generate_html_report(frame, profile, "operations.csv")

    for heading in ("Executive Summary", "Dataset and Cleaning Summary", "Performance Charts", "Anomalies", "7 Day Forecast", "Recommended Actions"):
        assert heading in html
    assert "<svg" in html
