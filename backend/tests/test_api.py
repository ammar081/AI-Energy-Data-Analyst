from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api import routes as api_routes
from app.database.db import Base, get_db
from app.main import app


@pytest.fixture
def api_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    upload_dir = tmp_path / "uploads"
    dataset_dir = tmp_path / "datasets"
    report_dir = tmp_path / "reports"
    for directory in (upload_dir, dataset_dir, report_dir):
        directory.mkdir()

    monkeypatch.setattr(api_routes.settings, "upload_dir", upload_dir)
    monkeypatch.setattr(api_routes.settings, "dataset_dir", dataset_dir)
    monkeypatch.setattr(api_routes.settings, "report_dir", report_dir)

    engine = create_engine(
        f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
        connect_args={"check_same_thread": False},
    )
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_db() -> Generator[Session, None, None]:
        database = testing_session()
        try:
            yield database
        finally:
            database.close()

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    try:
        yield client
    finally:
        client.close()
        app.dependency_overrides.clear()
        engine.dispose()


def test_dataset_workflow(api_client: TestClient) -> None:
    rows = ["timestamp,inverter_id,ac_power,ambient_temperature,irradiation"]
    for day in range(1, 13):
        rows.append(f"2026-01-{day:02d},INV-1,{100 + day},{20 + day / 10},{4 + day / 10}")
        rows.append(f"2026-01-{day:02d},INV-2,{90 + day},{19 + day / 10},{4 + day / 10}")
    csv_content = "\n".join(rows).encode("utf-8")

    upload = api_client.post(
        "/api/upload",
        files={"file": ("operations.csv", csv_content, "text/csv")},
    )

    assert upload.status_code == 201
    dataset_id = upload.json()["dataset"]["id"]

    summary = api_client.get(f"/api/datasets/{dataset_id}/summary")
    kpis = api_client.get(f"/api/datasets/{dataset_id}/kpis")
    forecast = api_client.get(f"/api/datasets/{dataset_id}/forecast?days=7")
    report = api_client.get(f"/api/datasets/{dataset_id}/report")
    question = api_client.post(
        f"/api/datasets/{dataset_id}/ask",
        json={"question": "Which plant produced the most energy this month?"},
    )

    assert summary.status_code == 200
    assert summary.json()["dataset"]["row_count"] == 24
    assert kpis.status_code == 200
    assert kpis.json()["best_performing_asset"]["asset"] == "INV-1"
    assert forecast.status_code == 200
    assert len(forecast.json()["forecast"]) == 7
    assert report.status_code == 200
    assert "Renewable Energy Performance Report" in report.text
    assert question.status_code == 200
    assert set(question.json()["explanation"]) == {
        "what_happened",
        "why_it_matters",
        "possible_reason",
        "suggested_next_step",
    }


def test_upload_rejects_files_over_configured_limit(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(api_routes.settings, "max_upload_size_mb", 1)

    response = api_client.post(
        "/api/upload",
        files={"file": ("too-large.csv", b"x" * (1024 * 1024 + 1), "text/csv")},
    )

    assert response.status_code == 413
    assert "1 MB" in response.json()["detail"]
    assert not any(api_routes.settings.upload_dir.iterdir())
