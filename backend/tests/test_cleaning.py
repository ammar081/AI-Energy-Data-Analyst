import pandas as pd

from app.services.cleaning import clean_dataset


def test_clean_dataset_standardizes_and_repairs_values() -> None:
    frame = pd.DataFrame(
        {
            "Timestamp": ["2026-01-01", "2026-01-01", "2026-01-02"],
            "AC Power": [100, 100, -5],
            "Inverter ID": ["INV-1", "INV-1", "INV-2"],
        }
    )

    cleaned, report = clean_dataset(frame)

    assert "ac_power" in cleaned.columns
    assert report["duplicate_rows_removed"] == 1
    assert report["negative_values_replaced"] == 1
    assert cleaned["ac_power"].min() >= 0
    assert report["columns_used_for_analysis"]["datetime_column"] == "timestamp"


def test_clean_dataset_interpolates_within_each_asset() -> None:
    frame = pd.DataFrame(
        {
            "timestamp": [
                "2026-01-01 00:00",
                "2026-01-01 00:00",
                "2026-01-01 01:00",
                "2026-01-01 01:00",
                "2026-01-01 02:00",
                "2026-01-01 02:00",
            ],
            "inverter_id": ["A", "B", "A", "B", "A", "B"],
            "ac_power": [10, 100, None, 200, 30, 300],
        }
    )

    cleaned, _ = clean_dataset(frame)

    repaired = cleaned.loc[
        (cleaned["inverter_id"] == "A") & (cleaned["timestamp"] == pd.Timestamp("2026-01-01 01:00")),
        "ac_power",
    ].iloc[0]
    assert repaired == 20


def test_clean_dataset_preserves_pre_cleaning_quality_evidence() -> None:
    frame = pd.DataFrame(
        {
            "timestamp": ["2026-01-01", "2026-01-02", "2026-01-03"],
            "inverter_id": ["A", "A", "A"],
            "ac_power": [10, None, 30],
        }
    )

    cleaned, report = clean_dataset(frame)

    assert cleaned["ac_power"].isna().sum() == 0
    assert report["original_missing_percentage"] == 11.11
    assert report["data_quality_events"][0]["timestamp"].startswith("2026-01-02")
