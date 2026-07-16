"use client";

import { Monitor, Moon, Sun, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { UserPreferences } from "@/lib/ui";

export function PreferencesPanel({
  open,
  preferences,
  onChange,
  onClose
}: {
  open: boolean;
  preferences: UserPreferences;
  onChange: (preferences: UserPreferences) => void;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  function update<Key extends keyof UserPreferences>(key: Key, value: UserPreferences[Key]) {
    onChange({ ...preferences, [key]: value });
  }

  return (
    <aside aria-labelledby="preferences-title" className="preferences-panel" role="dialog">
      <div className="preferences-heading"><div><h2 id="preferences-title">Display Preferences</h2><p>Saved in this browser</p></div><button aria-label="Close preferences" onClick={onClose} ref={closeButton} title="Close" type="button"><X size={19} /></button></div>
      <fieldset>
        <legend>Theme</legend>
        <div className="preference-segments">
          <label><input checked={preferences.theme === "system"} name="theme" onChange={() => update("theme", "system")} type="radio" /><Monitor size={17} /><span>System</span></label>
          <label><input checked={preferences.theme === "light"} name="theme" onChange={() => update("theme", "light")} type="radio" /><Sun size={17} /><span>Light</span></label>
          <label><input checked={preferences.theme === "dark"} name="theme" onChange={() => update("theme", "dark")} type="radio" /><Moon size={17} /><span>Dark</span></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Density</legend>
        <div className="preference-segments two">
          <label><input checked={preferences.density === "comfortable"} name="density" onChange={() => update("density", "comfortable")} type="radio" /><span>Comfortable</span></label>
          <label><input checked={preferences.density === "compact"} name="density" onChange={() => update("density", "compact")} type="radio" /><span>Compact</span></label>
        </div>
      </fieldset>
      <label className="preference-select"><span>Fleet rows per page</span><select onChange={(event) => update("fleetPageSize", Number(event.target.value))} value={preferences.fleetPageSize}><option value="5">5 rows</option><option value="10">10 rows</option><option value="20">20 rows</option></select></label>
      <label className="preference-select"><span>Maintenance currency</span><select onChange={(event) => update("currency", event.target.value as UserPreferences["currency"])} value={preferences.currency}><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></label>
      <label className="preference-select"><span>Default analysis period</span><select onChange={(event) => update("defaultPeriod", event.target.value as UserPreferences["defaultPeriod"])} value={preferences.defaultPeriod}><option value="all">All data</option><option value="7d">Latest 7 days</option><option value="30d">Latest 30 days</option><option value="90d">Latest 90 days</option></select></label>
    </aside>
  );
}
