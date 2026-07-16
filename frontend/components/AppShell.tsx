"use client";

import {
  Activity,
  BarChart3,
  Building2,
  Database,
  FileText,
  Gauge,
  LogOut,
  Menu,
  RefreshCcw,
  SlidersHorizontal,
  Settings,
  UploadCloud,
  X,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { PreferencesPanel } from "@/components/PreferencesPanel";
import { Dataset, User } from "@/lib/api";
import { UserPreferences, WorkspaceView } from "@/lib/ui";

export type { WorkspaceView } from "@/lib/ui";

type NavigationItem = {
  id: WorkspaceView;
  label: string;
  icon: LucideIcon;
};

const viewTitles: Record<WorkspaceView, { title: string; eyebrow: string }> = {
  fleet: { title: "Fleet Overview", eyebrow: "Operations" },
  analysis: { title: "Dataset Analysis", eyebrow: "Performance" },
  quality: { title: "Data Quality", eyebrow: "Validation" },
  compare: { title: "Fleet Comparison", eyebrow: "Benchmarking" },
  reports: { title: "Report Library", eyebrow: "Intelligence" },
  live: { title: "Live Telemetry", eyebrow: "Monitoring" },
  admin: { title: "Administration", eyebrow: "Workspace" }
};

export function AppShell({
  user,
  view,
  onViewChange,
  datasets,
  selectedId,
  onDatasetChange,
  onUpload,
  onRefresh,
  onReport,
  onLogout,
  isUploading,
  isRefreshing,
  preferences,
  onPreferencesChange,
  children
}: {
  user: User;
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  datasets: Dataset[];
  selectedId: string;
  onDatasetChange: (id: string) => void;
  onUpload: () => void;
  onRefresh: () => void;
  onReport: () => void;
  onLogout: () => void;
  isUploading: boolean;
  isRefreshing: boolean;
  preferences: UserPreferences;
  onPreferencesChange: (preferences: UserPreferences) => void;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const selected = datasets.find((dataset) => dataset.id === selectedId) ?? null;
  const currentTitle = viewTitles[view];
  const needsDataset = ["analysis", "quality", "reports", "live"].includes(view);

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [selectedId, view]);
  const closePreferences = useCallback(() => setPreferencesOpen(false), []);

  const primary: NavigationItem[] = [
    { id: "fleet", label: "Fleet", icon: Building2 },
    { id: "analysis", label: "Analysis", icon: Gauge },
    { id: "quality", label: "Data quality", icon: Database },
    { id: "compare", label: "Compare", icon: BarChart3 }
  ];
  const secondary: NavigationItem[] = [
    { id: "reports", label: "Reports", icon: FileText },
    { id: "live", label: "Live telemetry", icon: Activity },
    ...(user.role === "admin" ? [{ id: "admin" as const, label: "Administration", icon: Settings }] : [])
  ];

  function navigation(items: NavigationItem[]) {
    return items.map(({ id, label, icon: Icon }) => (
      <button aria-current={view === id ? "page" : undefined} className={view === id ? "active" : ""} key={id} onClick={() => onViewChange(id)} type="button">
        <Icon aria-hidden="true" size={19} /><span>{label}</span>
      </button>
    ));
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#workspace-content">Skip to main content</a>
      {mobileOpen ? <button aria-label="Close navigation" className="nav-backdrop" onClick={() => setMobileOpen(false)} type="button" /> : null}
      <aside className={`app-sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="shell-brand"><div className="brand-mark"><Zap size={21} /></div><div><strong>Energy Analyst</strong><small>Operations console</small></div><button aria-label="Close navigation" className="mobile-nav-close" onClick={() => setMobileOpen(false)} title="Close" type="button"><X size={20} /></button></div>
        <nav className="shell-nav" aria-label="Primary navigation">
          <span>Workspace</span>{navigation(primary)}
          <span>Operations</span>{navigation(secondary)}
        </nav>
        <div className="shell-user">
          <span>{user.full_name.slice(0, 1).toUpperCase()}</span>
          <div><strong>{user.full_name}</strong><small>{user.role}</small></div>
          <button aria-label="Sign out" onClick={onLogout} title="Sign out" type="button"><LogOut size={17} /></button>
        </div>
      </aside>

      <section className="app-workspace">
        <header className="app-toolbar">
          <button aria-label="Open navigation" className="mobile-menu" onClick={() => setMobileOpen(true)} title="Menu" type="button"><Menu size={21} /></button>
          <div className="toolbar-title"><p>{currentTitle.eyebrow}</p><h1>{currentTitle.title}</h1></div>
          <div className="toolbar-controls">
            {needsDataset ? (
              <label className="dataset-select"><span className="sr-only">Selected dataset</span><select onChange={(event) => onDatasetChange(event.target.value)} value={selectedId}><option value="">Select dataset</option>{datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.original_filename}</option>)}</select></label>
            ) : null}
            {needsDataset && selected ? <span className={`domain-chip ${selected.dataset_type}`}>{selected.dataset_type.replaceAll("_", " ")}</span> : null}
            {needsDataset ? <button aria-label="Refresh view" className="toolbar-icon" disabled={!selectedId || isRefreshing} onClick={onRefresh} title="Refresh" type="button"><RefreshCcw aria-hidden="true" className={isRefreshing ? "spin" : ""} size={18} /></button> : null}
            {view === "analysis" ? <button className="toolbar-command secondary" disabled={!selectedId} onClick={onReport} type="button"><FileText size={18} />Report</button> : null}
            {user.role !== "viewer" ? <button className="toolbar-command" disabled={isUploading} onClick={onUpload} type="button"><UploadCloud size={18} />{isUploading ? "Uploading" : "Upload"}</button> : null}
            <button aria-expanded={preferencesOpen} aria-label="Open display preferences" className="toolbar-icon" onClick={() => setPreferencesOpen((current) => !current)} title="Display preferences" type="button"><SlidersHorizontal aria-hidden="true" size={18} /></button>
          </div>
        </header>
        <div className="workspace-content" id="workspace-content" tabIndex={-1}>{children}</div>
      </section>
      <PreferencesPanel onChange={onPreferencesChange} onClose={closePreferences} open={preferencesOpen} preferences={preferences} />
    </main>
  );
}
