from html import escape
from typing import Any

import pandas as pd

from app.services.ai_service import generate_executive_report
from app.services.anomaly_service import detect_anomalies
from app.services.chart_service import build_charts
from app.services.forecast_service import forecast_output
from app.services.kpi_service import compute_kpis


def _format(value: Any) -> str:
    if value is None:
        return "Not available"
    if isinstance(value, float):
        return f"{value:,.2f}"
    return escape(str(value))


def _line_svg(series: list[tuple[str, list[float]]], title: str) -> str:
    width, height, padding = 900, 260, 38
    all_values = [value for _, values in series for value in values]
    if not all_values:
        return "<p class='muted'>No chart data available.</p>"
    lower, upper = min(all_values), max(all_values)
    value_range = max(upper - lower, 1.0)
    maximum_points = max(len(values) for _, values in series)
    colors = ["#087f5b", "#e67700", "#1971c2"]
    lines: list[str] = []
    for series_index, (label, values) in enumerate(series):
        points = []
        for index, value in enumerate(values):
            x = padding + index * (width - padding * 2) / max(maximum_points - 1, 1)
            y = height - padding - (value - lower) * (height - padding * 2) / value_range
            points.append(f"{x:.1f},{y:.1f}")
        lines.append(
            f"<polyline points='{' '.join(points)}' fill='none' stroke='{colors[series_index % len(colors)]}' "
            f"stroke-width='3' stroke-linejoin='round' />"
        )
        lines.append(
            f"<text x='{padding + series_index * 150}' y='22' fill='{colors[series_index % len(colors)]}' "
            f"font-size='13'>{escape(label)}</text>"
        )
    return (
        f"<figure><figcaption>{escape(title)}</figcaption><svg viewBox='0 0 {width} {height}' role='img' "
        f"aria-label='{escape(title)}'><line x1='{padding}' y1='{height-padding}' x2='{width-padding}' "
        f"y2='{height-padding}' stroke='#ced4da'/><line x1='{padding}' y1='{padding}' x2='{padding}' "
        f"y2='{height-padding}' stroke='#ced4da'/>{''.join(lines)}</svg></figure>"
    )


def _bar_svg(rows: list[dict[str, Any]], title: str) -> str:
    if not rows:
        return "<p class='muted'>No asset comparison data available.</p>"
    visible = rows[:8]
    maximum = max(float(row.get("value") or 0) for row in visible) or 1
    bars = []
    for index, row in enumerate(visible):
        y = 36 + index * 31
        value = float(row.get("value") or 0)
        bar_width = value / maximum * 620
        bars.append(
            f"<text x='8' y='{y + 15}' font-size='12'>{escape(str(row.get('asset', 'Unknown')))}</text>"
            f"<rect x='145' y='{y}' width='{bar_width:.1f}' height='20' fill='#1098ad' rx='2'/>"
            f"<text x='{155 + bar_width:.1f}' y='{y + 15}' font-size='12'>{value:,.2f}</text>"
        )
    height = 62 + len(visible) * 31
    return (
        f"<figure><figcaption>{escape(title)}</figcaption><svg viewBox='0 0 900 {height}' role='img' "
        f"aria-label='{escape(title)}'>{''.join(bars)}</svg></figure>"
    )


def _rule_recommendations(kpis: dict[str, Any], anomalies: list[dict[str, Any]], forecast: dict[str, Any]) -> list[str]:
    recommendations: list[str] = []
    if anomalies:
        recommendations.append("Review the highest-severity anomaly timestamps against status, maintenance, and weather logs.")
    if kpis.get("missing_data_percentage", 0) > 0:
        recommendations.append("Investigate telemetry completeness and repair the upstream ingestion source for missing readings.")
    if kpis.get("underperforming_asset"):
        asset = kpis["underperforming_asset"]["asset"]
        recommendations.append(f"Compare {asset} with peer assets under similar operating conditions before scheduling maintenance.")
    if "downward" in forecast.get("summary", "").lower():
        recommendations.append("Include the downward forecast range in near-term delivery and maintenance planning.")
    if len(recommendations) < 2:
        recommendations.append("Refresh the analysis when new production data arrives and monitor KPI movement against this baseline.")
    return recommendations[:5]


def generate_html_report(frame: pd.DataFrame, profile: dict[str, Any], dataset_name: str) -> str:
    kpis = compute_kpis(frame, profile)
    anomalies = detect_anomalies(frame, profile, limit=10)
    forecast = forecast_output(frame, profile, horizon_days=7)
    charts = build_charts(frame, profile)
    cleaning = profile.get("cleaning_report") or {}

    findings = {
        "dataset": {
            "name": dataset_name,
            "original_rows": cleaning.get("original_rows", len(frame)),
            "cleaned_rows": len(frame),
            "columns": len(frame.columns),
            "missing_data_percentage": kpis.get("missing_data_percentage"),
        },
        "kpis": {key: value for key, value in kpis.items() if key != "asset_performance"},
        "top_anomalies": anomalies[:5],
        "forecast": {"summary": forecast["summary"], "metrics": forecast["metrics"]},
    }
    ai_report = generate_executive_report(findings)
    recommendations = ai_report.recommendations if ai_report else _rule_recommendations(kpis, anomalies, forecast)
    summary = ai_report.summary if ai_report else (
        f"The dataset contains {len(frame):,} cleaned records. Total output is {_format(kpis['total_output'])}, "
        f"peak output is {_format(kpis.get('peak_output'))}, and downtime is estimated at "
        f"{_format(kpis.get('downtime_hours'))} hours. {forecast['summary']}"
    )
    summary_source = "Gemini structured analysis" if ai_report else "Deterministic analytics fallback"

    anomaly_rows = "".join(
        f"<tr><td>{_format(item['timestamp'])}</td><td>{_format(item.get('asset'))}</td>"
        f"<td>{_format(item['actual_value'])}</td><td>{_format(item['severity'])}</td>"
        f"<td>{_format(item['method'].replace('_', ' '))}</td><td>{_format(item['possible_explanation'])}</td></tr>"
        for item in anomalies
    ) or "<tr><td colspan='6'>No high-confidence anomalies detected.</td></tr>"
    forecast_rows = "".join(
        f"<tr><td>{_format(item['date'])}</td><td>{_format(item['predicted_value'])}</td>"
        f"<td>{_format(item['lower_bound'])}</td><td>{_format(item['upper_bound'])}</td></tr>"
        for item in forecast["forecast"]
    ) or "<tr><td colspan='4'>Forecast not available.</td></tr>"
    recommendation_rows = "".join(f"<li>{escape(item)}</li>" for item in recommendations)
    columns_used = cleaning.get("columns_used_for_analysis", {})
    columns_text = ", ".join(f"{key}: {value}" for key, value in columns_used.items() if value) or "No analysis columns detected"

    history_values = [float(item["value"]) for item in forecast["history"]]
    forecast_values = [float(item["predicted_value"]) for item in forecast["forecast"]]
    output_chart = _line_svg([("Historical output", history_values)], "Recent energy generation")
    forecast_chart = _line_svg([("Forecast", forecast_values)], "7 day output forecast")
    asset_chart = _bar_svg(charts.get("asset_comparison", []), "Asset production comparison")

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Renewable Energy Performance Report</title>
  <style>
    :root {{ --ink:#17211d; --muted:#64716b; --line:#dce6e1; --green:#087f5b; --paper:#ffffff; }}
    * {{ box-sizing:border-box; }}
    body {{ font-family:Arial,sans-serif; color:var(--ink); margin:0; background:#eef3f0; line-height:1.5; }}
    main {{ max-width:1080px; margin:0 auto; padding:40px 28px; background:var(--paper); }}
    h1,h2 {{ letter-spacing:0; margin:0 0 8px; }} h2 {{ margin-top:32px; font-size:21px; }}
    .muted {{ color:var(--muted); }} .source {{ font-size:12px; color:var(--muted); }}
    .grid {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:22px 0; }}
    .metric {{ border:1px solid var(--line); padding:14px; border-radius:6px; }}
    .metric strong {{ display:block; font-size:22px; margin-top:7px; overflow-wrap:anywhere; }}
    .quality-grid {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }}
    .quality-grid div {{ padding:10px 0; border-bottom:1px solid var(--line); }}
    figure {{ margin:18px 0 28px; border:1px solid var(--line); border-radius:6px; padding:14px; }}
    figcaption {{ font-weight:700; margin-bottom:8px; }} svg {{ width:100%; height:auto; display:block; }}
    table {{ width:100%; border-collapse:collapse; margin:14px 0 30px; font-size:13px; }}
    th,td {{ border-bottom:1px solid var(--line); padding:10px; text-align:left; vertical-align:top; }}
    th {{ background:#eef8f3; }} li {{ margin-bottom:8px; }}
    @media (max-width:760px) {{ .grid,.quality-grid {{ grid-template-columns:repeat(2,minmax(0,1fr)); }} main {{ padding:24px 16px; }} table {{ display:block; overflow-x:auto; }} }}
    @media print {{ body {{ background:#fff; }} main {{ padding:0; }} figure {{ break-inside:avoid; }} }}
  </style>
</head>
<body>
<main>
  <h1>Renewable Energy Performance Report</h1>
  <p class="muted">Dataset: {_format(dataset_name)}</p>
  <h2>Executive Summary</h2>
  <p>{escape(summary)}</p>
  <p class="source">Summary source: {escape(summary_source)}</p>

  <section class="grid">
    <div class="metric">Total Output<strong>{_format(kpis['total_output'])}</strong></div>
    <div class="metric">Average Daily<strong>{_format(kpis.get('average_daily_output'))}</strong></div>
    <div class="metric">Peak Output<strong>{_format(kpis.get('peak_output'))}</strong></div>
    <div class="metric">Downtime Hours<strong>{_format(kpis.get('downtime_hours'))}</strong></div>
    <div class="metric">Lowest Output<strong>{_format(kpis.get('lowest_output'))}</strong></div>
    <div class="metric">Capacity Factor<strong>{_format(kpis.get('capacity_factor'))}%</strong></div>
    <div class="metric">Missing Data<strong>{_format(kpis.get('missing_data_percentage'))}%</strong></div>
    <div class="metric">Forecast RMSE<strong>{_format(forecast['metrics'].get('rmse'))}</strong></div>
  </section>

  <h2>Dataset and Cleaning Summary</h2>
  <section class="quality-grid">
    <div>Original rows<br><strong>{_format(cleaning.get('original_rows', len(frame)))}</strong></div>
    <div>Cleaned rows<br><strong>{_format(len(frame))}</strong></div>
    <div>Columns<br><strong>{_format(len(frame.columns))}</strong></div>
    <div>Missing values fixed<br><strong>{_format(cleaning.get('missing_values_fixed', 0))}</strong></div>
    <div>Duplicates removed<br><strong>{_format(cleaning.get('duplicate_rows_removed', 0))}</strong></div>
    <div>Outlier cells detected<br><strong>{_format(cleaning.get('outlier_cells_detected', 0))}</strong></div>
  </section>
  <p><strong>Columns used:</strong> {escape(columns_text)}</p>

  <h2>Performance Charts</h2>
  {output_chart}
  {asset_chart}

  <h2>Anomalies</h2>
  <table>
    <thead><tr><th>Timestamp</th><th>Asset</th><th>Actual</th><th>Severity</th><th>Method</th><th>Explanation</th></tr></thead>
    <tbody>{anomaly_rows}</tbody>
  </table>

  <h2>7 Day Forecast</h2>
  <p>{escape(forecast['summary'])} MAE: {_format(forecast['metrics'].get('mae'))}; RMSE: {_format(forecast['metrics'].get('rmse'))}.</p>
  {forecast_chart}
  <table>
    <thead><tr><th>Date</th><th>Prediction</th><th>Lower</th><th>Upper</th></tr></thead>
    <tbody>{forecast_rows}</tbody>
  </table>

  <h2>Recommended Actions</h2>
  <ol>{recommendation_rows}</ol>
</main>
</body>
</html>"""
