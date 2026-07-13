from pathlib import Path

import pandas as pd
from sqlalchemy.orm import Session

from app.models.db import DatasetRecord


class DatasetNotFoundError(LookupError):
    pass


def get_dataset_or_404(db: Session, dataset_id: str) -> DatasetRecord:
    record = db.get(DatasetRecord, dataset_id)
    if record is None:
        raise DatasetNotFoundError(dataset_id)
    return record


def load_clean_dataset(record: DatasetRecord) -> pd.DataFrame:
    path = Path(record.cleaned_path)
    if not path.exists():
        raise FileNotFoundError(f"Cleaned dataset file is missing: {path}")
    frame = pd.read_csv(path)
    if record.datetime_column and record.datetime_column in frame.columns:
        frame[record.datetime_column] = pd.to_datetime(frame[record.datetime_column], errors="coerce")
    return frame


def record_profile(record: DatasetRecord) -> dict[str, object]:
    return {
        "datetime_column": record.datetime_column,
        "value_column": record.value_column,
        "asset_column": record.asset_column,
        **(record.summary_json.get("columns_used_for_analysis", {}) if record.summary_json else {}),
    }

