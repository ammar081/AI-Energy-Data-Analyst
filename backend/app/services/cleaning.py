from typing import Any

import numpy as np
import pandas as pd

from app.services.column_mapper import infer_columns, standardize_columns

NON_NEGATIVE_HINTS = ("energy", "power", "yield", "generation", "output", "irradiation", "irradiance")


def _convert_numeric_columns(frame: pd.DataFrame, protected_columns: set[str]) -> pd.DataFrame:
    converted = frame.copy()
    for column in converted.columns:
        if column in protected_columns or pd.api.types.is_numeric_dtype(converted[column]):
            continue
        numeric = pd.to_numeric(converted[column], errors="coerce")
        if numeric.notna().mean() >= 0.65:
            converted[column] = numeric
    return converted


def _fill_missing_values(
    frame: pd.DataFrame,
    datetime_column: str | None,
    asset_column: str | None,
) -> pd.DataFrame:
    filled = frame.copy()
    has_asset = bool(asset_column and asset_column in filled.columns)
    sort_columns = [column for column in (asset_column, datetime_column) if column and column in filled.columns]
    if sort_columns:
        filled = filled.sort_values(sort_columns, kind="stable")

    numeric_columns = [column for column in filled.columns if pd.api.types.is_numeric_dtype(filled[column])]
    for column in numeric_columns:
        series = filled[column]
        if series.isna().all():
            filled[column] = 0
            continue
        if has_asset and column != asset_column:
            grouped = filled.groupby(asset_column, dropna=False, sort=False)[column]
            repaired = grouped.transform(lambda values: values.interpolate(limit_direction="both"))
            repaired = repaired.fillna(grouped.transform("median"))
        else:
            repaired = series.interpolate(limit_direction="both")
        filled[column] = repaired.fillna(series.median())

    for column in filled.columns:
        if column in numeric_columns:
            continue
        if filled[column].isna().any():
            if has_asset and column != asset_column:
                grouped = filled.groupby(asset_column, dropna=False, sort=False)[column]
                filled[column] = grouped.transform(lambda values: values.ffill().bfill())
            mode = filled[column].mode(dropna=True)
            fallback = mode.iloc[0] if not mode.empty else "unknown"
            filled[column] = filled[column].fillna(fallback)

    if datetime_column and datetime_column in filled.columns:
        final_sort = [datetime_column]
        if has_asset:
            final_sort.append(str(asset_column))
        filled = filled.sort_values(final_sort, kind="stable").reset_index(drop=True)
    return filled


def _json_safe(value: Any) -> Any:
    if isinstance(value, (np.integer, np.floating)):
        return value.item()
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    return value


def clean_dataset(frame: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    original = frame.copy()
    cleaned = standardize_columns(frame)
    original_rows = len(cleaned)
    original_columns = len(cleaned.columns)
    original_dtypes = {column: str(dtype) for column, dtype in cleaned.dtypes.items()}
    original_missing = {column: int(count) for column, count in cleaned.isna().sum().items()}
    total_original_cells = max(original_rows * original_columns, 1)
    original_missing_percentage = round(sum(original_missing.values()) / total_original_cells * 100, 2)

    cleaned = cleaned.replace([np.inf, -np.inf], np.nan)
    cleaned = cleaned.dropna(how="all")

    duplicate_rows = int(cleaned.duplicated().sum())
    cleaned = cleaned.drop_duplicates().reset_index(drop=True)

    preliminary_map = infer_columns(cleaned)
    datetime_column = preliminary_map.datetime_column
    if datetime_column:
        cleaned[datetime_column] = pd.to_datetime(cleaned[datetime_column], errors="coerce")
        invalid_timestamps = int(cleaned[datetime_column].isna().sum())
        cleaned = cleaned.dropna(subset=[datetime_column]).reset_index(drop=True)
    else:
        invalid_timestamps = 0

    protected_columns = {column for column in [datetime_column, preliminary_map.asset_column, preliminary_map.status_column] if column}
    cleaned = _convert_numeric_columns(cleaned, protected_columns)

    negative_replacements = 0
    for column in cleaned.columns:
        if not pd.api.types.is_numeric_dtype(cleaned[column]):
            continue
        if any(hint in column for hint in NON_NEGATIVE_HINTS):
            mask = cleaned[column] < 0
            negative_replacements += int(mask.sum())
            cleaned.loc[mask, column] = np.nan

    quality_events: list[dict[str, Any]] = []
    value_column = preliminary_map.value_column
    if value_column and value_column in cleaned.columns:
        telemetry_missing = cleaned[value_column].isna()
        for _, row in cleaned.loc[telemetry_missing].head(200).iterrows():
            timestamp = row.get(datetime_column) if datetime_column else None
            asset = row.get(preliminary_map.asset_column) if preliminary_map.asset_column else None
            quality_events.append(
                {
                    "timestamp": _json_safe(timestamp) if pd.notna(timestamp) else None,
                    "asset": _json_safe(asset) if pd.notna(asset) else None,
                    "reason": "Output telemetry was missing or invalid and was repaired during cleaning.",
                }
            )

    missing_before_fill = int(cleaned.isna().sum().sum())
    cleaned = _fill_missing_values(cleaned, datetime_column, preliminary_map.asset_column)
    missing_after_fill = int(cleaned.isna().sum().sum())

    final_map = infer_columns(cleaned)
    outlier_cells = 0
    for column in cleaned.columns:
        if not pd.api.types.is_numeric_dtype(cleaned[column]):
            continue
        std = cleaned[column].std(skipna=True)
        if not std or np.isnan(std):
            continue
        z_scores = (cleaned[column] - cleaned[column].mean(skipna=True)) / std
        outlier_cells += int((z_scores.abs() > 4).sum())

    report = {
        "original_rows": original_rows,
        "original_columns": original_columns,
        "cleaned_rows": int(len(cleaned)),
        "cleaned_columns": int(len(cleaned.columns)),
        "duplicate_rows_removed": duplicate_rows,
        "invalid_timestamps_removed": invalid_timestamps,
        "missing_values_before_fill": missing_before_fill,
        "missing_values_after_fill": missing_after_fill,
        "missing_values_fixed": max(missing_before_fill - missing_after_fill, 0),
        "negative_values_replaced": negative_replacements,
        "outlier_cells_detected": outlier_cells,
        "original_dtypes": original_dtypes,
        "original_missing_values": original_missing,
        "original_missing_percentage": original_missing_percentage,
        "data_quality_events": quality_events,
        "columns_used_for_analysis": final_map.to_dict(),
        "original_preview": [
            {key: _json_safe(value) for key, value in row.items()}
            for row in original.head(5).to_dict(orient="records")
        ],
    }
    return cleaned, report
