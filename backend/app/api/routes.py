import logging
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database.db import get_db
from app.models.db import DatasetRecord
from app.models.schemas import (
    AnomalyOut,
    AskRequest,
    AskResponse,
    ChartResponse,
    DatasetOut,
    ForecastResponse,
    KPIResponse,
    SummaryResponse,
    UploadResponse,
)
from app.services.anomaly_service import detect_anomalies
from app.services.chart_service import build_charts
from app.services.cleaning import clean_dataset
from app.services.data_access import DatasetNotFoundError, get_dataset_or_404, load_clean_dataset, record_profile
from app.services.file_reader import SUPPORTED_EXTENSIONS, read_table, write_clean_table
from app.services.forecast_service import forecast_output
from app.services.kpi_service import compute_kpis
from app.services.qa_service import answer_question
from app.services.report_service import generate_html_report


router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)
UPLOAD_CHUNK_SIZE = 1024 * 1024


def _safe_filename(filename: str) -> str:
    base = Path(filename).name
    cleaned = "".join(character if character.isalnum() or character in {".", "_", "-"} else "_" for character in base)
    return cleaned or "dataset.csv"


def _dataset_out(record: DatasetRecord) -> DatasetOut:
    return DatasetOut.model_validate(record)


def _handle_lookup(db: Session, dataset_id: str) -> DatasetRecord:
    try:
        return get_dataset_or_404(db, dataset_id)
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Dataset not found") from exc


async def _store_upload(file: UploadFile, destination: Path) -> int:
    total_bytes = 0
    try:
        with destination.open("wb") as output:
            while chunk := await file.read(UPLOAD_CHUNK_SIZE):
                total_bytes += len(chunk)
                if total_bytes > settings.max_upload_size_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds the {settings.max_upload_size_mb} MB upload limit.",
                    )
                output.write(chunk)
        if total_bytes == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        return total_bytes
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_dataset(file: UploadFile = File(...), db: Session = Depends(get_db)) -> UploadResponse:
    original_name = file.filename or "dataset.csv"
    suffix = Path(original_name).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Upload a CSV or Excel file.")

    dataset_id = str(uuid4())
    safe_name = _safe_filename(original_name)
    raw_path = settings.upload_dir / f"{dataset_id}_{safe_name}"
    clean_path = settings.dataset_dir / f"{dataset_id}.csv"

    await _store_upload(file, raw_path)

    try:
        raw_frame = await run_in_threadpool(read_table, raw_path)
        clean_frame, report = await run_in_threadpool(clean_dataset, raw_frame)
        await run_in_threadpool(write_clean_table, clean_frame, clean_path)
    except Exception as exc:
        raw_path.unlink(missing_ok=True)
        clean_path.unlink(missing_ok=True)
        logger.exception("Dataset processing failed for %s", original_name)
        raise HTTPException(
            status_code=400,
            detail="Could not process dataset. Check the file format and column values.",
        ) from exc

    profile = report["columns_used_for_analysis"]
    record = DatasetRecord(
        id=dataset_id,
        original_filename=original_name,
        raw_path=str(raw_path),
        cleaned_path=str(clean_path),
        row_count=len(clean_frame),
        column_count=len(clean_frame.columns),
        datetime_column=profile.get("datetime_column"),
        value_column=profile.get("value_column"),
        asset_column=profile.get("asset_column"),
        summary_json=report,
    )
    try:
        db.add(record)
        db.commit()
        db.refresh(record)
    except SQLAlchemyError as exc:
        db.rollback()
        raw_path.unlink(missing_ok=True)
        clean_path.unlink(missing_ok=True)
        logger.exception("Could not save metadata for dataset %s", dataset_id)
        raise HTTPException(status_code=500, detail="Could not save dataset metadata.") from exc
    return UploadResponse(dataset=_dataset_out(record), cleaning_report=report)


@router.get("/datasets", response_model=list[DatasetOut])
def list_datasets(db: Session = Depends(get_db)) -> list[DatasetOut]:
    records = db.query(DatasetRecord).order_by(DatasetRecord.created_at.desc()).all()
    return [_dataset_out(record) for record in records]


@router.get("/datasets/{dataset_id}/summary", response_model=SummaryResponse)
def dataset_summary(dataset_id: str, db: Session = Depends(get_db)) -> SummaryResponse:
    record = _handle_lookup(db, dataset_id)
    frame = load_clean_dataset(record)
    return SummaryResponse(
        dataset=_dataset_out(record),
        columns=list(frame.columns),
        dtypes={column: str(dtype) for column, dtype in frame.dtypes.items()},
        missing_values={column: int(value) for column, value in frame.isna().sum().items()},
        sample_rows=frame.head(10).where(frame.notna(), None).to_dict(orient="records"),
        cleaning_report=record.summary_json or {},
    )


@router.get("/datasets/{dataset_id}/kpis", response_model=KPIResponse)
def dataset_kpis(dataset_id: str, db: Session = Depends(get_db)) -> dict:
    record = _handle_lookup(db, dataset_id)
    return compute_kpis(load_clean_dataset(record), record_profile(record))


@router.get("/datasets/{dataset_id}/charts", response_model=ChartResponse)
def dataset_charts(dataset_id: str, db: Session = Depends(get_db)) -> dict:
    record = _handle_lookup(db, dataset_id)
    return build_charts(load_clean_dataset(record), record_profile(record))


@router.get("/datasets/{dataset_id}/anomalies", response_model=list[AnomalyOut])
def dataset_anomalies(
    dataset_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[dict]:
    record = _handle_lookup(db, dataset_id)
    return detect_anomalies(load_clean_dataset(record), record_profile(record), limit=limit)


@router.get("/datasets/{dataset_id}/forecast", response_model=ForecastResponse)
def dataset_forecast(
    dataset_id: str,
    days: int = Query(default=7, ge=1, le=30),
    db: Session = Depends(get_db),
) -> dict:
    record = _handle_lookup(db, dataset_id)
    return forecast_output(load_clean_dataset(record), record_profile(record), horizon_days=days)


@router.post("/datasets/{dataset_id}/ask", response_model=AskResponse)
def ask_dataset(dataset_id: str, request: AskRequest, db: Session = Depends(get_db)) -> dict:
    record = _handle_lookup(db, dataset_id)
    return answer_question(request.question, load_clean_dataset(record), record_profile(record))


@router.get("/datasets/{dataset_id}/report", response_class=HTMLResponse)
def dataset_report(dataset_id: str, db: Session = Depends(get_db)) -> HTMLResponse:
    record = _handle_lookup(db, dataset_id)
    html = generate_html_report(load_clean_dataset(record), record_profile(record), record.original_filename)
    return HTMLResponse(content=html)
