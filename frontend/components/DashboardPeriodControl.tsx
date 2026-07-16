"use client";

import { CalendarRange } from "lucide-react";
import { DashboardPeriod, periodLabel, PeriodPreset } from "@/lib/ui";

export function DashboardPeriodControl({ period, onChange }: { period: DashboardPeriod; onChange: (period: DashboardPeriod) => void }) {
  function selectPreset(preset: PeriodPreset) {
    onChange({ preset, from: preset === "custom" ? period.from : "", to: preset === "custom" ? period.to : "" });
  }

  return (
    <div className="analysis-filters" aria-label="Dashboard period">
      <CalendarRange aria-hidden="true" size={18} />
      <label><span>Analysis period</span><select aria-label="Analysis period" onChange={(event) => selectPreset(event.target.value as PeriodPreset)} value={period.preset}><option value="all">All data</option><option value="7d">Latest 7 days</option><option value="30d">Latest 30 days</option><option value="90d">Latest 90 days</option><option value="custom">Custom range</option></select></label>
      {period.preset === "custom" ? <div className="custom-period"><label><span>From</span><input max={period.to || undefined} onChange={(event) => onChange({ ...period, from: event.target.value })} type="date" value={period.from} /></label><label><span>To</span><input min={period.from || undefined} onChange={(event) => onChange({ ...period, to: event.target.value })} type="date" value={period.to} /></label></div> : null}
      <span className="period-description" aria-live="polite">{periodLabel(period)}</span>
    </div>
  );
}
