from dataclasses import asdict, dataclass

import pandas as pd


DATE_HINTS = ("date", "time", "timestamp", "datetime", "period")
VALUE_HINTS = (
    "ac_power",
    "energy_generated",
    "energy",
    "generation",
    "production",
    "output",
    "daily_yield",
    "power",
    "yield",
)
ASSET_HINTS = ("asset", "inverter", "turbine", "source_key", "plant", "site", "meter", "device")
WEATHER_HINTS = ("irradiation", "irradiance", "temperature", "wind", "humidity", "weather")


@dataclass(frozen=True)
class ColumnMap:
    datetime_column: str | None
    value_column: str | None
    asset_column: str | None
    weather_columns: list[str]
    capacity_column: str | None
    status_column: str | None

    def to_dict(self) -> dict[str, str | list[str] | None]:
        return asdict(self)


def normalize_column_name(name: object) -> str:
    normalized = str(name).strip().lower()
    normalized = normalized.replace("%", "pct")
    normalized = "".join(character if character.isalnum() else "_" for character in normalized)
    while "__" in normalized:
        normalized = normalized.replace("__", "_")
    return normalized.strip("_") or "unnamed_column"


def standardize_columns(frame: pd.DataFrame) -> pd.DataFrame:
    renamed = frame.copy()
    seen: dict[str, int] = {}
    columns: list[str] = []
    for column in renamed.columns:
        base = normalize_column_name(column)
        count = seen.get(base, 0)
        seen[base] = count + 1
        columns.append(base if count == 0 else f"{base}_{count + 1}")
    renamed.columns = columns
    return renamed


def infer_datetime_column(frame: pd.DataFrame) -> str | None:
    for column in frame.columns:
        if any(hint in column for hint in DATE_HINTS):
            parsed = pd.to_datetime(frame[column], errors="coerce")
            if parsed.notna().mean() >= 0.6:
                return column

    best_column: str | None = None
    best_score = 0.0
    for column in frame.columns:
        if pd.api.types.is_datetime64_any_dtype(frame[column]):
            return column
        if pd.api.types.is_numeric_dtype(frame[column]):
            continue
        parsed = pd.to_datetime(frame[column], errors="coerce")
        score = float(parsed.notna().mean())
        if score > best_score:
            best_column = column
            best_score = score
    return best_column if best_score >= 0.8 else None


def infer_value_column(frame: pd.DataFrame) -> str | None:
    numeric_columns = [column for column in frame.columns if pd.api.types.is_numeric_dtype(frame[column])]
    if not numeric_columns:
        return None

    def score(column: str) -> tuple[int, float, float]:
        hint_score = max((len(VALUE_HINTS) - index for index, hint in enumerate(VALUE_HINTS) if hint in column), default=0)
        non_zero_share = float((frame[column].fillna(0) != 0).mean())
        variability = float(frame[column].std(skipna=True) or 0)
        return hint_score, non_zero_share, variability

    excluded = ("temperature", "humidity", "capacity", "id", "pct", "percentage")
    candidates = [column for column in numeric_columns if not any(term in column for term in excluded)]
    candidates = candidates or numeric_columns
    return max(candidates, key=score)


def infer_asset_column(frame: pd.DataFrame) -> str | None:
    candidates = []
    for column in frame.columns:
        unique_ratio = frame[column].nunique(dropna=True) / max(len(frame), 1)
        if any(hint in column for hint in ASSET_HINTS) and unique_ratio <= 0.5:
            candidates.append((frame[column].nunique(dropna=True), column))
    if candidates:
        return sorted(candidates, reverse=True)[0][1]
    return None


def infer_columns(frame: pd.DataFrame) -> ColumnMap:
    weather_columns = [
        column
        for column in frame.columns
        if any(hint in column for hint in WEATHER_HINTS) and pd.api.types.is_numeric_dtype(frame[column])
    ]
    capacity_column = next((column for column in frame.columns if "capacity" in column), None)
    status_column = next((column for column in frame.columns if "status" in column or "state" in column), None)
    return ColumnMap(
        datetime_column=infer_datetime_column(frame),
        value_column=infer_value_column(frame),
        asset_column=infer_asset_column(frame),
        weather_columns=weather_columns,
        capacity_column=capacity_column,
        status_column=status_column,
    )
