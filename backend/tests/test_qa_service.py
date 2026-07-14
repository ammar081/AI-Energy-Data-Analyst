import pandas as pd

from app.services import qa_service


def _frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "timestamp": pd.to_datetime(["2026-01-31", "2026-01-31", "2026-02-01", "2026-02-01", "2026-02-02", "2026-02-02"]),
            "asset": ["A", "B", "A", "B", "A", "B"],
            "energy": [200, 100, 180, 90, 100, 95],
            "irradiation": [5, 5, 6, 6, 7, 7],
        }
    )


def _profile() -> dict[str, object]:
    return {"datetime_column": "timestamp", "value_column": "energy", "asset_column": "asset"}


def test_question_router_applies_latest_dataset_month(monkeypatch) -> None:
    monkeypatch.setattr(qa_service, "classify_intent", lambda question: None)
    monkeypatch.setattr(qa_service, "explain_findings", lambda question, findings: None)

    result = qa_service.answer_question("Which plant produced the most energy this month?", _frame(), _profile())

    assert result["source"] == "rules"
    assert result["analysis_period"] == "February 2026"
    assert result["data"]["asset_performance"][0]["asset"] == "A"


def test_question_router_calculates_biggest_daily_drop(monkeypatch) -> None:
    monkeypatch.setattr(qa_service, "classify_intent", lambda question: None)
    monkeypatch.setattr(qa_service, "explain_findings", lambda question, findings: None)

    result = qa_service.answer_question("Which day had the biggest production drop?", _frame(), _profile())

    assert result["data"]["biggest_drop"]["date"] == "2026-02-02"
    assert result["explanation"]["suggested_next_step"]
