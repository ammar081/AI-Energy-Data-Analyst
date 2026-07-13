from typing import Any

import pandas as pd

from app.services.anomaly_service import detect_anomalies
from app.services.forecast_service import forecast_output
from app.services.kpi_service import compute_kpis


def classify_question(question: str) -> str:
    text = question.lower()
    if any(word in text for word in ("forecast", "predict", "next", "future", "outlook")):
        return "forecast_output"
    if any(word in text for word in ("anomaly", "abnormal", "unusual", "drop", "spike", "zero")):
        return "detect_anomalies"
    if any(word in text for word in ("best", "worst", "underperform", "compare", "asset", "plant", "turbine", "inverter")):
        return "compare_assets"
    if any(word in text for word in ("trend", "why", "explain", "reason", "factor", "related")):
        return "explain_trend"
    if any(word in text for word in ("report", "summary", "overview", "business")):
        return "generate_report"
    return "summarize_dataset"


def answer_question(question: str, frame: pd.DataFrame, profile: dict[str, Any]) -> dict[str, Any]:
    intent = classify_question(question)
    kpis = compute_kpis(frame, profile)

    if intent == "forecast_output":
        forecast = forecast_output(frame, profile, horizon_days=7)
        return {
            "intent": intent,
            "answer": forecast["summary"],
            "data": {"forecast": forecast},
        }

    if intent == "detect_anomalies":
        anomalies = detect_anomalies(frame, profile, limit=8)
        if anomalies:
            top = anomalies[0]
            answer = (
                f"Found {len(anomalies)} notable anomalies. The strongest signal is {top['metric']} "
                f"at {top['actual_value']} for {top.get('asset') or 'the dataset'}, marked {top['severity']} severity."
            )
        else:
            answer = "No strong anomalies were detected using the current rules."
        return {"intent": intent, "answer": answer, "data": {"anomalies": anomalies}}

    if intent == "compare_assets":
        assets = kpis.get("asset_performance", [])
        if assets:
            best = assets[0]
            weakest = assets[-1]
            answer = (
                f"{best['asset']} is the strongest asset with {best['total_output']} total output. "
                f"{weakest['asset']} is currently the weakest with {weakest['total_output']}."
            )
        else:
            answer = "The dataset does not include a clear asset column for comparison."
        return {"intent": intent, "answer": answer, "data": {"asset_performance": assets}}

    if intent == "explain_trend":
        forecast = forecast_output(frame, profile, horizon_days=7)
        anomalies = detect_anomalies(frame, profile, limit=5)
        answer = (
            f"Total output is {kpis['total_output']} and the near-term forecast is {forecast['summary'].lower()} "
            f"{'Anomalies should be reviewed first.' if anomalies else 'No major anomaly cluster is visible.'}"
        )
        return {"intent": intent, "answer": answer, "data": {"kpis": kpis, "forecast": forecast, "anomalies": anomalies}}

    if intent == "generate_report":
        answer = (
            f"The dataset produced {kpis['total_output']} total output. "
            f"Peak output was {kpis.get('peak_output')}, and downtime is estimated at {kpis.get('downtime_hours')} hours."
        )
        return {"intent": intent, "answer": answer, "data": {"kpis": kpis}}

    answer = (
        f"The dataset has {len(frame)} clean rows and {len(frame.columns)} columns. "
        f"The main output column is {profile.get('value_column') or 'not detected'}."
    )
    return {"intent": intent, "answer": answer, "data": {"kpis": kpis}}

