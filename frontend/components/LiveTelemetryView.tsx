"use client";

import { Activity, CircleStop, Play, Radio } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, ErrorState, Notify, ProgressState } from "@/components/FeedbackStates";
import { Dataset, getAccessToken, telemetryWebSocketUrl } from "@/lib/api";
import { CurrencyPreference, formatMeasurement, inferUnit } from "@/lib/ui";

type TelemetryPoint = { timestamp: string; asset: string; metric: string; value: number; expected: number; status: "normal" | "alert"; deviation_percentage: number };

export function LiveTelemetryView({ dataset, currency, onNotify }: { dataset: Dataset | null; currency: CurrencyPreference; onNotify: Notify }) {
  const socketRef = useRef<WebSocket | null>(null);
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [connection, setConnection] = useState<"idle" | "connecting" | "live" | "closed">("idle");
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    socketRef.current?.close(1000, "Stopped by user");
    socketRef.current = null;
    setConnection("closed");
  }, []);

  const start = useCallback(() => {
    if (!dataset) return;
    socketRef.current?.close(1000, "Restarting stream");
    setPoints([]);
    setError("");
    setConnection("connecting");
    const socket = new WebSocket(telemetryWebSocketUrl(dataset.id));
    socketRef.current = socket;
    socket.onopen = () => socket.send(JSON.stringify({ access_token: getAccessToken() }));
    socket.onmessage = (event) => {
      const point = JSON.parse(event.data) as TelemetryPoint;
      setPoints((current) => [...current.slice(-59), point]);
      setConnection("live");
    };
    socket.onerror = () => setError("The telemetry stream could not be opened.");
    socket.onclose = (event) => {
      socketRef.current = null;
      setConnection("closed");
      if (event.code >= 4400) setError(event.reason || "The telemetry connection was rejected.");
    };
  }, [dataset]);

  useEffect(() => {
    setPoints([]);
    setError("");
    setConnection("idle");
    return () => socketRef.current?.close();
  }, [dataset?.id]);

  useEffect(() => {
    if (connection === "live") onNotify("Live telemetry connected.", "success");
  }, [connection, onNotify]);

  const latest = points.at(-1);
  const unit = inferUnit(latest?.metric ?? dataset?.value_column, "MW");
  const chartRows = points.map((point) => ({ ...point, time: new Date(point.timestamp).toLocaleTimeString() }));

  return (
    <section className="telemetry-view">
      <div className="telemetry-toolbar"><div><h3>Live Telemetry</h3><p>{dataset?.original_filename ?? "No dataset selected"}</p></div><div className="stream-actions"><span aria-live="polite" className={`connection-state ${connection}`}>{connection}</span>{connection === "live" || connection === "connecting" ? <button aria-label="Stop telemetry" className="icon-button" onClick={stop} title="Stop telemetry" type="button"><CircleStop aria-hidden="true" size={18} /></button> : <button className="primary-command compact" disabled={!dataset} onClick={start} type="button"><Play aria-hidden="true" size={18} />Start</button>}</div></div>
      {connection === "connecting" ? <ProgressState title="Connecting telemetry" detail="Authenticating the live stream and waiting for the first observation." /> : null}
      {error ? <ErrorState message={error} onRetry={start} /> : null}
      {connection === "idle" || connection === "closed" && !points.length && !error ? <EmptyState icon={<Radio size={24} />} title="Telemetry is stopped" detail="Start the stream to simulate live asset observations for the selected dataset." action={<button className="primary-command compact" disabled={!dataset} onClick={start} type="button"><Play size={18} />Start telemetry</button>} /> : null}
      {points.length ? <>
        <div aria-label="Latest telemetry metrics" className="metrics-grid telemetry-metrics">
          <div className="metric-tile green"><span>Current value</span><strong>{formatMeasurement(latest?.value, unit, currency)}</strong><small>{latest?.metric.replaceAll("_", " ")}</small></div>
          <div className="metric-tile teal"><span>Expected</span><strong>{formatMeasurement(latest?.expected, unit, currency)}</strong></div>
          <div className="metric-tile amber"><span>Deviation</span><strong>{formatMeasurement(latest?.deviation_percentage, "%", currency)}</strong></div>
          <div className={`metric-tile ${latest?.status === "alert" ? "red" : "green"}`}><span>Status</span><strong>{latest?.status ?? "idle"}</strong><small>{latest?.asset}</small></div>
        </div>
        <section className="panel wide"><div className="panel-heading"><div><h3>Telemetry Stream</h3><p>{points.length} observations</p></div><Activity aria-hidden="true" size={20} /></div><div aria-label="Live telemetry value and expected value chart" className="chart-frame chart-accessible" role="img"><span className="sr-only">Latest {points.length} telemetry observations for {latest?.asset ?? "the selected dataset"}.</span><ResponsiveContainer height={340} width="100%"><LineChart accessibilityLayer data={chartRows}><CartesianGrid stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="time" minTickGap={30} /><YAxis /><Tooltip formatter={(value) => formatMeasurement(Number(value), unit, currency)} /><Legend /><Line dataKey="value" dot={false} name={`Actual (${unit})`} stroke="var(--green)" strokeWidth={2} /><Line dataKey="expected" dot={false} name={`Expected (${unit})`} stroke="var(--amber)" strokeDasharray="4 4" /></LineChart></ResponsiveContainer></div></section>
      </> : null}
    </section>
  );
}
