from functools import lru_cache
from pathlib import Path
from threading import RLock

import pandas as pd
from sqlalchemy.orm import Session

from app.models.db import DatasetRecord


class DatasetNotFoundError(LookupError):
    pass


_dataset_cache_lock = RLock()


@lru_cache(maxsize=2)
def _read_clean_dataset(path_value: str, modified_ns: int, datetime_column: str | None) -> pd.DataFrame:
    del modified_ns  # File modification time is part of the cache key.
    frame = pd.read_csv(path_value)
    if datetime_column and datetime_column in frame.columns:
        frame[datetime_column] = pd.to_datetime(frame[datetime_column], errors="coerce")
    return frame


def clear_dataset_cache() -> None:
    with _dataset_cache_lock:
        _read_clean_dataset.cache_clear()


def get_dataset_or_404(db: Session, dataset_id: str) -> DatasetRecord:
    record = db.get(DatasetRecord, dataset_id)
    if record is None:
        raise DatasetNotFoundError(dataset_id)
    return record


def load_clean_dataset(record: DatasetRecord) -> pd.DataFrame:
    path = Path(record.cleaned_path)
    if not path.exists():
        raise FileNotFoundError(f"Cleaned dataset file is missing: {path}")
    stat = path.stat()
    with _dataset_cache_lock:
        return _read_clean_dataset(str(path.resolve()), stat.st_mtime_ns, record.datetime_column)


def record_profile(record: DatasetRecord) -> dict[str, object]:
    cleaning_report = record.summary_json or {}
    return {
        "datetime_column": record.datetime_column,
        "value_column": record.value_column,
        "asset_column": record.asset_column,
        **cleaning_report.get("columns_used_for_analysis", {}),
        "cleaning_report": cleaning_report,
        "original_missing_percentage": cleaning_report.get("original_missing_percentage", 0),
    }
