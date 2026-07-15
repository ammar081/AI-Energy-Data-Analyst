from datetime import UTC, datetime

from app.models.db import ReportRecord
from app.services.report_search_service import html_to_search_text, search_reports


def _report(identifier: str, text: str) -> ReportRecord:
    return ReportRecord(
        id=identifier,
        dataset_id="dataset-1",
        title=f"Report {identifier}",
        html_content=f"<html><body>{text}</body></html>",
        search_text=text,
        created_at=datetime.now(UTC),
    )


def test_html_extraction_and_vector_search() -> None:
    reports = [
        _report("solar", "Solar inverter output dropped after high temperature events."),
        _report("wind", "Wind turbine maintenance backlog includes gearbox inspection."),
    ]

    assert html_to_search_text("<h1>Energy</h1><p>Clean output</p>") == "Energy Clean output"
    results = search_reports(reports, "inverter temperature", limit=2)

    assert results[0][0].id == "solar"
    assert results[0][1] > 0
