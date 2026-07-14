import re
from typing import Any

import pandas as pd

from app.services.ai_service import (
    AnalysisIntent,
    BusinessExplanation,
    IntentDecision,
    classify_intent,
    explain_findings,
)
from app.services.anomaly_service import detect_anomalies
from app.services.forecast_service import forecast_output
from app.services.kpi_service import compute_kpis


def _rule_decision(question: str) -> IntentDecision:
    text = question.lower()
    period = "all_data"
    if "this month" in text or "current month" in text:
        period = "current_month"
    elif "last 30 days" in text or "past 30 days" in text:
        period = "last_30_days"

    horizon = 7
    horizon_match = re.search(r"\b(7|14|30)\s*(?:day|days|d)\b", text)
    if horizon_match:
        horizon = int(horizon_match.group(1))

    if any(word in text for word in ("forecast", "predict", "future", "outlook")):
        intent = AnalysisIntent.forecast_output
    elif any(word in text for word in ("anomaly", "abnormal", "unusual", "drop", "spike", "zero", "telemetry")):
        intent = AnalysisIntent.detect_anomalies
    elif any(word in text for word in ("best", "most", "worst", "underperform", "compare", "asset", "plant", "turbine", "inverter")):
        intent = AnalysisIntent.compare_assets
    elif any(word in text for word in ("trend", "why", "explain", "reason", "factor", "related", "relationship")):
        intent = AnalysisIntent.explain_trend
    elif any(word in text for word in ("report", "business summary", "executive summary")):
        intent = AnalysisIntent.generate_report
    else:
        intent = AnalysisIntent.summarize_dataset
    return IntentDecision(intent=intent, period=period, horizon_days=horizon)


def classify_question(question: str) -> str:
    return _rule_decision(question).intent.value


def _filter_period(
    frame: pd.DataFrame, datetime_column: str | None, period: str
) -> tuple[pd.DataFrame, str]:
    if period == "all_data" or not datetime_column or datetime_column not in frame.columns:
        return frame, "All available data"
    timestamps = pd.to_datetime(frame[datetime_column], errors="coerce")
    maximum = timestamps.max()
    if pd.isna(maximum):
        return frame, "All available data"
    if period == "current_month":
        mask = timestamps.dt.to_period("M") == maximum.to_period("M")
        return frame.loc[mask].copy(), maximum.strftime("%B %Y")
    start = maximum - pd.Timedelta(days=29)
    return frame.loc[timestamps.between(start, maximum)].copy(), f"{start.date()} to {maximum.date()}"


def _biggest_production_drop(frame: pd.DataFrame, profile: dict[str, Any]) -> dict[str, Any] | None:
    value_column = profile.get("value_column")
    datetime_column = profile.get("datetime_column")
    if not value_column or not datetime_column or value_column not in frame.columns or datetime_column not in frame.columns:
        return None
    daily = (
        frame.assign(
            **{
                value_column: pd.to_numeric(frame[value_column], errors="coerce"),
                datetime_column: pd.to_datetime(frame[datetime_column], errors="coerce"),
            }
        )
        .dropna(subset=[datetime_column, value_column])
        .set_index(datetime_column)[value_column]
        .resample("D")
        .sum()
    )
    changes = daily.diff()
    if changes.dropna().empty:
        return None
    date = changes.idxmin()
    drop = float(changes.loc[date])
    if drop >= 0:
        return None
    position = daily.index.get_loc(date)
    return {
        "date": date.date().isoformat(),
        "drop": round(abs(drop), 2),
        "previous_output": round(float(daily.iloc[position - 1]), 2),
        "current_output": round(float(daily.iloc[position]), 2),
    }


def _production_factors(frame: pd.DataFrame, profile: dict[str, Any]) -> list[dict[str, Any]]:
    value_column = profile.get("value_column")
    if not value_column or value_column not in frame.columns:
        return []
    numeric = frame.select_dtypes(include=["number"]).copy()
    if value_column not in numeric.columns:
        numeric[value_column] = pd.to_numeric(frame[value_column], errors="coerce")
    correlations = numeric.corr(numeric_only=True)[value_column].drop(labels=[value_column], errors="ignore").dropna()
    strongest = correlations.reindex(correlations.abs().sort_values(ascending=False).index).head(4)
    return [
        {
            "factor": str(column),
            "correlation": round(float(value), 3),
            "relationship": "positive" if value > 0 else "negative",
        }
        for column, value in strongest.items()
    ]


def _fallback_explanation(answer: str, intent: AnalysisIntent, anomalies: list[dict[str, Any]]) -> BusinessExplanation:
    possible_reason = "The available data shows an operating pattern, but it does not prove a root cause."
    next_step = "Validate the finding against weather, status, and maintenance records before taking action."
    if anomalies:
        possible_reason = anomalies[0]["possible_explanation"]
        next_step = "Review the highest-severity timestamps with the operations and data-quality teams."
    elif intent == AnalysisIntent.compare_assets:
        next_step = "Compare the weakest asset with peers under similar weather and availability conditions."
    elif intent == AnalysisIntent.forecast_output:
        next_step = "Use the forecast range for planning and refresh it as new production data arrives."
    return BusinessExplanation(
        what_happened=answer,
        why_it_matters="This result can affect production planning, maintenance priority, and expected energy delivery.",
        possible_reason=possible_reason,
        suggested_next_step=next_step,
    )


def _bounded(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _bounded(item) for key, item in list(value.items())[:20]}
    if isinstance(value, list):
        return [_bounded(item) for item in value[:10]]
    if isinstance(value, str):
        return value[:500]
    return value


def answer_question(question: str, frame: pd.DataFrame, profile: dict[str, Any]) -> dict[str, Any]:
    ai_decision = classify_intent(question)
    decision = ai_decision or _rule_decision(question)
    filtered, period_label = _filter_period(frame, profile.get("datetime_column"), decision.period)
    if filtered.empty:
        filtered = frame
        period_label = "All available data"

    kpis = compute_kpis(filtered, profile)
    anomalies: list[dict[str, Any]] = []
    data: dict[str, Any] = {}
    text = question.lower()

    if "biggest" in text and "drop" in text:
        drop = _biggest_production_drop(filtered, profile)
        if drop:
            answer = (
                f"The biggest daily production drop occurred on {drop['date']}: output fell by {drop['drop']} "
                f"from {drop['previous_output']} to {drop['current_output']}."
            )
            data["biggest_drop"] = drop
        else:
            answer = "There is not enough daily history to calculate a production drop."
    elif "factor" in text or "related" in text or "relationship" in text:
        factors = _production_factors(filtered, profile)
        if factors:
            lead = factors[0]
            answer = (
                f"{lead['factor']} has the strongest measured relationship with output "
                f"({lead['relationship']}, correlation {lead['correlation']}). Correlation is evidence of association, not cause."
            )
        else:
            answer = "The dataset does not contain enough numeric operating factors for a reliable relationship check."
        data["factors"] = factors
    elif decision.intent == AnalysisIntent.forecast_output:
        forecast = forecast_output(filtered, profile, horizon_days=decision.horizon_days)
        answer = forecast["summary"]
        data["forecast"] = forecast
    elif decision.intent == AnalysisIntent.detect_anomalies:
        anomalies = detect_anomalies(filtered, profile, limit=8)
        if anomalies:
            top = anomalies[0]
            answer = (
                f"Found {len(anomalies)} notable events. The highest-priority signal is {top['method'].replace('_', ' ')} "
                f"for {top.get('asset') or 'the dataset'} at {top.get('timestamp') or 'an unknown time'}."
            )
        else:
            answer = "No strong anomalies were detected using the current statistical and operating rules."
        data["anomalies"] = anomalies
    elif decision.intent == AnalysisIntent.compare_assets:
        assets = kpis.get("asset_performance", [])
        if assets:
            best, weakest = assets[0], assets[-1]
            answer = (
                f"For {period_label}, {best['asset']} produced the most energy at {best['total_output']}. "
                f"{weakest['asset']} was the lowest at {weakest['total_output']}."
            )
        else:
            answer = "The dataset does not include a clear asset column for comparison."
        data["asset_performance"] = assets
    elif decision.intent == AnalysisIntent.explain_trend:
        forecast = forecast_output(filtered, profile, horizon_days=decision.horizon_days)
        anomalies = detect_anomalies(filtered, profile, limit=5)
        answer = (
            f"Total output for {period_label} is {kpis['total_output']}. {forecast['summary']} "
            f"{'The anomaly list should be reviewed first.' if anomalies else 'No major anomaly cluster is visible.'}"
        )
        data.update({"kpis": kpis, "forecast": forecast, "anomalies": anomalies})
    elif decision.intent == AnalysisIntent.generate_report:
        answer = (
            f"Output totals {kpis['total_output']}, peak generation is {kpis.get('peak_output')}, "
            f"and estimated downtime is {kpis.get('downtime_hours')} hours for {period_label}."
        )
        data["kpis"] = kpis
    else:
        answer = (
            f"The selected period contains {len(filtered)} clean rows and {len(filtered.columns)} columns. "
            f"The main output column is {profile.get('value_column') or 'not detected'}."
        )
        data["kpis"] = kpis

    findings = {
        "intent": decision.intent.value,
        "period": period_label,
        "answer": answer,
        "kpis": {key: value for key, value in kpis.items() if key != "asset_performance"},
        "top_anomalies": anomalies[:3],
        "analysis": _bounded(data),
    }
    ai_explanation = explain_findings(question, findings)
    explanation = ai_explanation or _fallback_explanation(answer, decision.intent, anomalies)
    return {
        "intent": decision.intent.value,
        "answer": answer,
        "source": "openai" if ai_decision or ai_explanation else "rules",
        "analysis_period": period_label,
        "explanation": explanation.model_dump(),
        "data": data,
    }
