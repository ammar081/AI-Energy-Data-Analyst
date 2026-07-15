import pandas as pd

from app.services.column_mapper import infer_columns
from app.services.kpi_service import compute_kpis
from app.services.operations_service import analyze_demand, analyze_maintenance


def test_demand_analysis_and_forecast_inputs() -> None:
    frame = pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-01", periods=48, freq="h"),
            "meter_id": ["M-1"] * 48,
            "demand_kw": [50 + index % 12 for index in range(48)],
        }
    )
    profile = infer_columns(frame).to_dict()
    result = analyze_demand(frame, profile)
    kpis = compute_kpis(frame, profile)

    assert profile["dataset_type"] == "demand"
    assert result["peak_demand"] == 61
    assert len(result["daily_demand"]) == 2
    assert kpis["load_factor"] is not None
    assert kpis["metric_type"] == "demand"


def test_maintenance_work_order_analysis() -> None:
    frame = pd.DataFrame(
        {
            "event_date": pd.date_range("2026-01-01", periods=4, freq="D"),
            "work_order_id": ["WO-1", "WO-2", "WO-3", "WO-4"],
            "asset_id": ["INV-1", "INV-1", "INV-2", "INV-2"],
            "maintenance_type": ["inspection", "repair", "repair", "cleaning"],
            "status": ["completed", "open", "completed", "pending"],
            "repair_hours": [1.0, 4.0, 3.0, 2.0],
            "maintenance_cost": [25.0, 200.0, 150.0, 40.0],
        }
    )
    profile = infer_columns(frame).to_dict()
    result = analyze_maintenance(frame, profile)
    kpis = compute_kpis(frame, profile)

    assert profile["dataset_type"] == "maintenance"
    assert result["maintenance_events"] == 4
    assert result["open_work_orders"] == 2
    assert result["average_repair_hours"] == 2.5
    assert result["maintenance_cost"] == 415
    assert kpis["availability_percentage"] is not None


def test_average_efficiency_uses_expected_output() -> None:
    frame = pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-01", periods=3, freq="D"),
            "energy_generated": [80.0, 90.0, 100.0],
            "expected_energy": [100.0, 100.0, 100.0],
        }
    )
    profile = infer_columns(frame).to_dict()

    assert compute_kpis(frame, profile)["average_efficiency"] == 90.0
