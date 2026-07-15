from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api import routes as api_routes
from app.database.db import Base, get_db
from app.main import app
from app.tasks import report_tasks


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
    monkeypatch.setattr(report_tasks, "SessionLocal", testing_session)
    monkeypatch.setattr(
        report_tasks,
        "generate_html_report",
        lambda *_: "<html><body>Temperature anomaly review and inverter maintenance actions.</body></html>",
    )

    def override_db() -> Generator[Session, None, None]:
        database = testing_session()
        try:
            yield database
        finally:
            database.close()

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    try:
        registration = client.post(
            "/api/auth/register",
            json={"email": "admin@example.com", "full_name": "Test Admin", "password": "strong-test-password"},
        )
        assert registration.status_code == 201
        client.headers["Authorization"] = f"Bearer {registration.json()['access_token']}"
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

    deletion = api_client.delete(f"/api/datasets/{dataset_id}")
    assert deletion.status_code == 204
    assert api_client.get(f"/api/datasets/{dataset_id}/summary").status_code == 404
    assert api_client.get("/api/datasets").json() == []
    assert not any(api_routes.settings.upload_dir.iterdir())
    assert not any(api_routes.settings.dataset_dir.iterdir())


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


def test_role_permissions(api_client: TestClient) -> None:
    registration = api_client.post(
        "/api/auth/register",
        json={"email": "viewer@example.com", "full_name": "Test Viewer", "password": "strong-viewer-password"},
    )
    assert registration.status_code == 201
    viewer = registration.json()["user"]

    update = api_client.patch(f"/api/admin/users/{viewer['id']}", json={"role": "viewer"})
    assert update.status_code == 200

    login = api_client.post(
        "/api/auth/login",
        json={"email": "viewer@example.com", "password": "strong-viewer-password"},
    )
    viewer_token = login.json()["access_token"]
    denied = api_client.post(
        "/api/upload",
        headers={"Authorization": f"Bearer {viewer_token}"},
        files={"file": ("operations.csv", b"date,output\n2026-01-01,10", "text/csv")},
    )
    assert denied.status_code == 403


def test_comparison_background_report_and_vector_search(api_client: TestClient) -> None:
    first = api_client.post(
        "/api/upload",
        files={"file": ("site-a.csv", b"date,output\n2026-01-01,10\n2026-01-02,12", "text/csv")},
    )
    second = api_client.post(
        "/api/upload",
        files={"file": ("site-b.csv", b"date,output\n2026-01-01,8\n2026-01-02,9", "text/csv")},
    )
    first_id = first.json()["dataset"]["id"]
    second_id = second.json()["dataset"]["id"]

    comparison = api_client.get(f"/api/comparison?dataset_ids={first_id}&dataset_ids={second_id}")
    assert comparison.status_code == 200
    assert comparison.json()["leader_dataset_id"] == first_id

    queued = api_client.post(f"/api/datasets/{first_id}/reports")
    assert queued.status_code == 202
    job = api_client.get(f"/api/jobs/{queued.json()['job_id']}")
    assert job.status_code == 200
    assert job.json()["status"] == "success"

    reports = api_client.get("/api/reports")
    search = api_client.get("/api/reports/search?q=temperature+inverter")
    assert len(reports.json()) == 1
    assert search.json()[0]["report"]["id"] == reports.json()[0]["id"]

    token = api_client.headers["Authorization"].removeprefix("Bearer ")
    with api_client.websocket_connect(f"/api/telemetry/{first_id}/stream") as socket:
        socket.send_json({"access_token": token})
        telemetry = socket.receive_json()
        assert telemetry["status"] in {"normal", "alert"}
        assert telemetry["value"] >= 0
