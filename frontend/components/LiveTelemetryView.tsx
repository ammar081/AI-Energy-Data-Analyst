"use client";

import { Activity, CircleStop, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Dataset, getAccessToken, telemetryWebSocketUrl } from "@/lib/api";

type TelemetryPoint = { timestamp: string; asset: string; metric: string; value: number; expected: number; status: "normal" | "alert"; deviation_percentage: number };

export function LiveTelemetryView({ dataset }: { dataset: Dataset | null }) {
  const socketRef = useRef<WebSocket | null>(null);
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [connection, setConnection] = useState<"idle" | "connecting" | "live" | "closed">("idle");
  const [error, setError] = useState("");

  function stop() {
    socketRef.current?.close(1000, "Stopped by user");
    socketRef.current = null;
    setConnection("closed");
  }

  function start() {
    if (!dataset) return;
    stop();
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
  }

  useEffect(() => () => socketRef.current?.close(), []);
  const latest = points.at(-1);

  return (
    <section className="telemetry-view">
      <div className="telemetry-toolbar">
        <div><h3>Live Telemetry</h3><p>{dataset?.original_filename ?? "No dataset selected"}</p></div>
        <div className="stream-actions"><span className={`connection-state ${connection}`}>{connection}</span>{connection === "live" || connection === "connecting" ? <button aria-label="Stop telemetry" className="icon-button" onClick={stop} title="Stop telemetry" type="button"><CircleStop size={18} /></button> : <button className="primary-command compact" disabled={!dataset} onClick={start} type="button"><Play size={18} />Start</button>}</div>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="metrics-grid telemetry-metrics">
        <div className="metric-tile green"><span>Current value</span><strong>{latest?.value.toLocaleString() ?? "n/a"}</strong><small>{latest?.metric.replaceAll("_", " ")}</small></div>
        <div className="metric-tile teal"><span>Expected</span><strong>{latest?.expected.toLocaleString() ?? "n/a"}</strong></div>
        <div className="metric-tile amber"><span>Deviation</span><strong>{latest ? `${latest.deviation_percentage}%` : "n/a"}</strong></div>
        <div className={`metric-tile ${latest?.status === "alert" ? "red" : "green"}`}><span>Status</span><strong>{latest?.status ?? "idle"}</strong><small>{latest?.asset}</small></div>
      </div>
      <div className="panel wide">
        <div className="panel-heading"><div><h3>Telemetry Stream</h3><p>{points.length} observations</p></div><Activity size={20} /></div>
        <div className="chart-frame"><ResponsiveContainer height={340} width="100%"><LineChart data={points.map((point) => ({ ...point, time: new Date(point.timestamp).toLocaleTimeString() }))}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="time" minTickGap={30} /><YAxis /><Tooltip /><Legend /><Line dataKey="value" dot={false} stroke="#087f5b" strokeWidth={2} /><Line dataKey="expected" dot={false} stroke="#f08c00" strokeDasharray="4 4" /></LineChart></ResponsiveContainer></div>
      </div>
    </section>
  );
}
