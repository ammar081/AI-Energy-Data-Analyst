from uuid import uuid4

from app.database.db import SessionLocal
from app.models.db import DatasetRecord, ReportRecord
from app.services.data_access import load_clean_dataset, record_profile
from app.services.report_search_service import html_to_search_text
from app.services.report_service import generate_html_report
from app.tasks.celery_app import celery_app


@celery_app.task(name="reports.generate", bind=True)
def generate_report_task(self, dataset_id: str, user_id: str | None = None) -> dict[str, str]:
    database = SessionLocal()
    try:
        record = database.get(DatasetRecord, dataset_id)
        if record is None:
            raise ValueError("Dataset not found")
        self.update_state(state="PROGRESS", meta={"stage": "analyzing"})
        html = generate_html_report(load_clean_dataset(record), record_profile(record), record.original_filename)
        report = ReportRecord(
            id=str(uuid4()),
            dataset_id=record.id,
            title=f"Performance report - {record.original_filename}",
            html_content=html,
            search_text=html_to_search_text(html),
            created_by=user_id,
        )
        database.add(report)
        database.commit()
        return {"report_id": report.id, "dataset_id": dataset_id}
    finally:
        database.close()
