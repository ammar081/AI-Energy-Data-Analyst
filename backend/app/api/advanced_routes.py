import asyncio
import math
import random
from datetime import UTC, datetime
from typing import Any

import pandas as pd
from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.api.dependencies import require_analyst, require_viewer
from app.database.db import get_db
from app.models.db import DatasetRecord, ReportRecord, UserRecord
from app.models.schemas import (
    ComparisonDataset,
    ComparisonResponse,
    DatasetOut,
    DemandAnalysisResponse,
    GeneratedReportOut,
    JobStatusResponse,
    MaintenanceAnalysisResponse,
    ReportJobResponse,
    ReportSearchResult,
)
from app.services.auth_service import InvalidTokenError, decode_access_token
from app.services.data_access import DatasetNotFoundError, get_dataset_or_404, load_clean_dataset, record_profile
from app.services.forecast_service import forecast_output
from app.services.kpi_service import compute_kpis
from app.services.operations_service import analyze_demand, analyze_maintenance
from app.services.report_search_service import search_reports
from app.tasks.celery_app import celery_app
from app.tasks.report_tasks import generate_report_task

router = APIRouter()


def _record(db: Session, dataset_id: str) -> DatasetRecord:
    try:
        return get_dataset_or_404(db, dataset_id)
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found") from exc


def _dataset_out(record: DatasetRecord) -> DatasetOut:
    profile = record_profile(record)
    return DatasetOut(
        id=record.id,
        original_filename=record.original_filename,
        row_count=record.row_count,
        column_count=record.column_count,
        datetime_column=record.datetime_column,
        value_column=record.value_column,
        asset_column=record.asset_column,
        dataset_type=str(profile.get("dataset_type") or "generation"),
        created_at=record.created_at,
    )


@router.get("/datasets/{dataset_id}/demand", response_model=DemandAnalysisResponse)
def demand_analysis(
    dataset_id: str,
    days: int = Query(default=7, ge=1, le=30),
    _: UserRecord = Depends(require_viewer),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    record = _record(db, dataset_id)
    frame = load_clean_dataset(record)
    profile = record_profile(record)
    demand = analyze_demand(frame, profile)
    if demand["demand_column"]:
        demand_profile = {**profile, "value_column": demand["demand_column"]}
        demand["forecast"] = forecast_output(frame, demand_profile, days)
    else:
        demand["forecast"] = None
    return demand


@router.get("/datasets/{dataset_id}/maintenance", response_model=MaintenanceAnalysisResponse)
def maintenance_analysis(
    dataset_id: str,
    _: UserRecord = Depends(require_viewer),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    record = _record(db, dataset_id)
    return analyze_maintenance(load_clean_dataset(record), record_profile(record))


@router.get("/comparison", response_model=ComparisonResponse)
def compare_datasets(
    dataset_ids: list[str] = Query(min_length=2, max_length=6),
    _: UserRecord = Depends(require_viewer),
    db: Session = Depends(get_db),
) -> ComparisonResponse:
    if len(set(dataset_ids)) != len(dataset_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose distinct datasets")
    rows: list[ComparisonDataset] = []
    periods: list[pd.Timestamp] = []
    for dataset_id in dataset_ids:
        record = _record(db, dataset_id)
        frame = load_clean_dataset(record)
        profile = record_profile(record)
        kpis = compute_kpis(frame, profile)
        metric_type = str(profile.get("dataset_type") or "generation")
        if metric_type == "maintenance":
            primary_metric = "availability_percentage"
            primary_value = kpis.get("availability_percentage")
        elif profile.get("demand_column") and metric_type == "demand":
            primary_metric = "peak_demand"
            primary_value = kpis.get("peak_demand")
        else:
            primary_metric = "total_output"
            primary_value = kpis.get("total_output")
        rows.append(
            ComparisonDataset(
                dataset=_dataset_out(record),
                metric_type=metric_type,
                primary_metric=primary_metric,
                primary_value=primary_value,
                total_output=kpis["total_output"],
                average_daily_output=kpis.get("average_daily_output"),
                peak_output=kpis.get("peak_output"),
                average_efficiency=kpis.get("average_efficiency"),
                capacity_factor=kpis.get("capacity_factor"),
                downtime_hours=kpis.get("downtime_hours"),
                missing_data_percentage=kpis["missing_data_percentage"],
            )
        )
        datetime_column = profile.get("datetime_column")
        if datetime_column and datetime_column in frame:
            periods.extend(pd.to_datetime(frame[datetime_column], errors="coerce").dropna().tolist())

    comparable = [row for row in rows if row.primary_value is not None]
    leader = max(comparable, key=lambda row: float(row.primary_value or 0)) if comparable else None
    common_period = "All available data"
    if periods:
        common_period = f"{min(periods).date().isoformat()} to {max(periods).date().isoformat()}"
    return ComparisonResponse(
        datasets=rows,
        ranking_metric=leader.primary_metric if leader else "not_available",
        leader_dataset_id=leader.dataset.id if leader else None,
        common_period=common_period,
    )


@router.post("/datasets/{dataset_id}/reports", response_model=ReportJobResponse, status_code=status.HTTP_202_ACCEPTED)
def queue_report(
    dataset_id: str,
    user: UserRecord = Depends(require_analyst),
    db: Session = Depends(get_db),
) -> ReportJobResponse:
    _record(db, dataset_id)
    job = generate_report_task.delay(dataset_id, user.id)
    return ReportJobResponse(job_id=job.id, status=job.state.lower())


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
def job_status(job_id: str, _: UserRecord = Depends(require_viewer)) -> JobStatusResponse:
    job = AsyncResult(job_id, app=celery_app)
    result = job.result if job.successful() and isinstance(job.result, dict) else None
    error = str(job.result)[:500] if job.failed() else None
    return JobStatusResponse(job_id=job_id, status=job.state.lower(), result=result, error=error)


@router.get("/reports", response_model=list[GeneratedReportOut])
def list_reports(_: UserRecord = Depends(require_viewer), db: Session = Depends(get_db)) -> list[GeneratedReportOut]:
    records = db.query(ReportRecord).order_by(ReportRecord.created_at.desc()).limit(100).all()
    return [GeneratedReportOut.model_validate(record) for record in records]


@router.get("/reports/search", response_model=list[ReportSearchResult])
def report_search(
    q: str = Query(min_length=2, max_length=300),
    limit: int = Query(default=10, ge=1, le=20),
    _: UserRecord = Depends(require_viewer),
    db: Session = Depends(get_db),
) -> list[ReportSearchResult]:
    reports = db.query(ReportRecord).order_by(ReportRecord.created_at.desc()).limit(500).all()
    return [
        ReportSearchResult(report=GeneratedReportOut.model_validate(report), score=score, excerpt=excerpt)
        for report, score, excerpt in search_reports(reports, q, limit)
    ]


@router.get("/reports/{report_id}", response_class=HTMLResponse)
def generated_report(
    report_id: str,
    _: UserRecord = Depends(require_viewer),
    db: Session = Depends(get_db),
) -> HTMLResponse:
    report = db.get(ReportRecord, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return HTMLResponse(report.html_content)


@router.websocket("/telemetry/{dataset_id}/stream")
async def telemetry_stream(websocket: WebSocket, dataset_id: str, db: Session = Depends(get_db)) -> None:
    await websocket.accept()
    try:
        credentials = await asyncio.wait_for(websocket.receive_json(), timeout=8)
        payload = decode_access_token(str(credentials.get("access_token", "")))
        user = db.get(UserRecord, str(payload["sub"]))
        if user is None or not user.is_active:
            await websocket.close(code=4401, reason="Account unavailable")
            return
        record = db.get(DatasetRecord, dataset_id)
        if record is None:
            await websocket.close(code=4404, reason="Dataset not found")
            return

        frame = load_clean_dataset(record)
        profile = record_profile(record)
        value_column = profile.get("demand_column") if profile.get("dataset_type") == "demand" else profile.get("value_column")
        values = pd.to_numeric(frame[value_column], errors="coerce").dropna() if value_column in frame else pd.Series(dtype=float)
        baseline = float(values.tail(min(len(values), 100)).mean()) if not values.empty else 100.0
        spread = max(float(values.std(ddof=0)) if len(values) > 1 else baseline * 0.05, baseline * 0.02, 1.0)
        assets = frame[profile["asset_column"]].dropna().astype(str).unique().tolist() if profile.get("asset_column") in frame else []
        randomizer = random.Random(dataset_id)
        tick = 0
        while True:
            expected = max(baseline * (1 + 0.08 * math.sin(tick / 5)), 0)
            actual = max(randomizer.gauss(expected, spread * 0.35), 0)
            deviation = abs(actual - expected) / max(expected, 1)
            await websocket.send_json(
                {
                    "timestamp": datetime.now(UTC).isoformat(),
                    "asset": assets[tick % len(assets)] if assets else record.original_filename,
                    "metric": str(value_column or "output"),
                    "value": round(actual, 2),
                    "expected": round(expected, 2),
                    "status": "alert" if deviation > 0.18 else "normal",
                    "deviation_percentage": round(deviation * 100, 2),
                }
            )
            tick += 1
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        return
    except (TimeoutError, InvalidTokenError, ValueError, TypeError):
        try:
            await websocket.close(code=4401, reason="Authentication failed")
        except RuntimeError:
            return
