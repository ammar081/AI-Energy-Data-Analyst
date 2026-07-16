"use client";

import { AlertCircle, CheckCircle2, Database, Info, Loader2, X } from "lucide-react";
import { ReactNode, useEffect } from "react";

export type ToastMessage = {
  id: number;
  message: string;
  type: "success" | "error" | "info";
};

export type Notify = (message: string, type?: ToastMessage["type"]) => void;

export function ToastRegion({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(onDismiss, 4200);
    return () => window.clearTimeout(timeout);
  }, [toast, onDismiss]);

  if (!toast) return null;
  const Icon = toast.type === "success" ? CheckCircle2 : toast.type === "error" ? AlertCircle : Info;
  return (
    <div aria-live={toast.type === "error" ? "assertive" : "polite"} className={`toast-message ${toast.type}`} role={toast.type === "error" ? "alert" : "status"}>
      <Icon size={19} />
      <span>{toast.message}</span>
      <button aria-label="Dismiss notification" onClick={onDismiss} title="Dismiss" type="button"><X size={17} /></button>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  detail,
  action
}: {
  icon?: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon ?? <Database size={24} />}</div>
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="request-error" role="alert">
      <AlertCircle size={22} />
      <div><strong>Unable to load this view</strong><p>{message}</p></div>
      {onRetry ? <button onClick={onRetry} type="button">Try again</button> : null}
    </div>
  );
}

export function ProgressState({ title, detail }: { title: string; detail?: string }) {
  return <div aria-live="polite" className="progress-state" role="status"><Loader2 aria-hidden="true" className="spin" size={21} /><div><strong>{title}</strong>{detail ? <p>{detail}</p> : null}</div></div>;
}

export function SuccessState({ title, detail }: { title: string; detail?: string }) {
  return <div aria-live="polite" className="success-state" role="status"><CheckCircle2 aria-hidden="true" size={21} /><div><strong>{title}</strong>{detail ? <p>{detail}</p> : null}</div></div>;
}

export function DashboardSkeleton() {
  return (
    <div aria-label="Loading dashboard" className="dashboard-skeleton" role="status">
      <div className="skeleton-kpis">{Array.from({ length: 6 }, (_, index) => <div className="skeleton-block" key={index} />)}</div>
      <div className="skeleton-chart skeleton-block" />
      <div className="skeleton-halves"><div className="skeleton-block" /><div className="skeleton-block" /></div>
      <span className="sr-only"><Loader2 />Loading dashboard</span>
    </div>
  );
}

export function FleetSkeleton() {
  return (
    <div aria-label="Loading fleet overview" className="dashboard-skeleton" role="status">
      <div className="skeleton-kpis fleet">{Array.from({ length: 4 }, (_, index) => <div className="skeleton-block" key={index} />)}</div>
      <div className="skeleton-table skeleton-block" />
    </div>
  );
}
