from pathlib import Path

import pandas as pd

from app.models.db import DatasetRecord
from app.services import data_access


def test_clean_dataset_is_cached_until_the_file_changes(tmp_path: Path, monkeypatch) -> None:
    clean_path = tmp_path / "clean.csv"
    clean_path.write_text("timestamp,energy\n2026-01-01,10\n", encoding="utf-8")
    record = DatasetRecord(
        id="cached-dataset",
        original_filename="clean.csv",
        raw_path=str(tmp_path / "raw.csv"),
        cleaned_path=str(clean_path),
        row_count=1,
        column_count=2,
        datetime_column="timestamp",
        value_column="energy",
        summary_json={},
    )
    calls = 0
    original_read_csv = pd.read_csv

    def counted_read_csv(*args, **kwargs):
        nonlocal calls
        calls += 1
        return original_read_csv(*args, **kwargs)

    data_access.clear_dataset_cache()
    monkeypatch.setattr(pd, "read_csv", counted_read_csv)

    first = data_access.load_clean_dataset(record)
    second = data_access.load_clean_dataset(record)

    assert calls == 1
    assert first is second
    data_access.clear_dataset_cache()
