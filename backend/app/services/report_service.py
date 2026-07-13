from html import escape
from typing import Any

import pandas as pd

from app.services.anomaly_service import detect_anomalies
from app.services.forecast_service import forecast_output
from app.services.kpi_service import compute_kpis


def _format(value: Any) -> str:
    if value is None:
        return "Not available"
    if isinstance(value, float):
        return f"{value:,.2f}"
    return escape(str(value))


def generate_html_report(frame: pd.DataFrame, profile: dict[str, Any], dataset_name: str) -> str:
    kpis = compute_kpis(frame, profile)
    anomalies = detect_anomalies(frame, profile, limit=10)
    forecast = forecast_output(frame, profile, horizon_days=7)

    anomaly_rows = "".join(
        f"<tr><td>{_format(item['timestamp'])}</td><td>{_format(item.get('asset'))}</td>"
        f"<td>{_format(item['actual_value'])}</td><td>{_format(item['severity'])}</td>"
        f"<td>{_format(item['possible_explanation'])}</td></tr>"
        for item in anomalies
    ) or "<tr><td colspan='5'>No high-confidence anomalies detected.</td></tr>"

    forecast_rows = "".join(
        f"<tr><td>{_format(item['date'])}</td><td>{_format(item['predicted_value'])}</td>"
        f"<td>{_format(item['lower_bound'])}</td><td>{_format(item['upper_bound'])}</td></tr>"
        for item in forecast["forecast"]
    )

    best_asset = kpis.get("best_performing_asset") or {}
    weak_asset = kpis.get("underperforming_asset") or {}

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Renewable Energy Performance Report</title>
  <style>
    body {{ font-family: Arial, sans-serif; color: #16201c; margin: 0; background: #f5f7f5; }}
    main {{ max-width: 1040px; margin: 0 auto; padding: 40px 24px; background: #fff; }}
    h1, h2 {{ margin-bottom: 8px; }}
    .muted {{ color: #66736d; }}
    .grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 24px 0; }}
    .metric {{ border: 1px solid #dbe3df; padding: 14px; border-radius: 8px; }}
    .metric strong {{ display: block; font-size: 22px; margin-top: 8px; }}
    table {{ width: 100%; border-collapse: collapse; margin: 14px 0 30px; }}
    th, td {{ border-bottom: 1px solid #dbe3df; padding: 10px; text-align: left; vertical-align: top; }}
    th {{ background: #eef4f1; }}
    @media print {{ body {{ background: #fff; }} main {{ padding: 0; }} }}
  </style>
</head>
<body>
<main>
  <h1>Renewable Energy Performance Report</h1>
  <p class="muted">Dataset: {_format(dataset_name)}</p>
  <h2>Executive Summary</h2>
  <p>Total output is <strong>{_format(kpis['total_output'])}</strong>. Peak output reached
  <strong>{_format(kpis.get('peak_output'))}</strong>, and estimated downtime is
  <strong>{_format(kpis.get('downtime_hours'))} hours</strong>. {escape(forecast['summary'])}</p>

  <section class="grid">
    <div class="metric">Total Output<strong>{_format(kpis['total_output'])}</strong></div>
    <div class="metric">Average Daily<strong>{_format(kpis.get('average_daily_output'))}</strong></div>
    <div class="metric">Peak Output<strong>{_format(kpis.get('peak_output'))}</strong></div>
    <div class="metric">Downtime Hours<strong>{_format(kpis.get('downtime_hours'))}</strong></div>
  </section>

  <h2>Asset Performance</h2>
  <p>Best asset: <strong>{_format(best_asset.get('asset'))}</strong>.
  Asset needing attention: <strong>{_format(weak_asset.get('asset'))}</strong>.</p>

  <h2>Anomalies</h2>
  <table>
    <thead><tr><th>Timestamp</th><th>Asset</th><th>Actual</th><th>Severity</th><th>Explanation</th></tr></thead>
    <tbody>{anomaly_rows}</tbody>
  </table>

  <h2>7 Day Forecast</h2>
  <table>
    <thead><tr><th>Date</th><th>Prediction</th><th>Lower</th><th>Upper</th></tr></thead>
    <tbody>{forecast_rows}</tbody>
  </table>
</main>
</body>
</html>"""

