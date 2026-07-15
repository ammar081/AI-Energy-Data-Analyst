"use client";

import { FileSearch, FileText, Loader2, Search } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { api, Dataset, GeneratedReport, openHtmlDocument, ReportSearchResult, User } from "@/lib/api";

export function ReportsView({ dataset, user }: { dataset: Dataset | null; user: User }) {
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [results, setResults] = useState<ReportSearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  async function loadReports() {
    try { setReports(await api.reports()); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load reports."); }
  }
  useEffect(() => { loadReports(); }, []);

  async function generate() {
    if (!dataset) return;
    setIsGenerating(true);
    setError("");
    try {
      const queued = await api.queueReport(dataset.id);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const job = await api.job(queued.job_id);
        if (job.status === "success") { await loadReports(); return; }
        if (job.status === "failure") throw new Error(job.error ?? "Report generation failed.");
        await new Promise((resolve) => window.setTimeout(resolve, 750));
      }
      throw new Error("Report generation is still running. Refresh the report list shortly.");
    } catch (err) { setError(err instanceof Error ? err.message : "Report generation failed."); }
    finally { setIsGenerating(false); }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    setError("");
    try { setResults(await api.searchReports(query.trim())); }
    catch (err) { setError(err instanceof Error ? err.message : "Report search failed."); }
    finally { setIsSearching(false); }
  }

  return (
    <section className="reports-view">
      <div className="report-toolbar">
        <div><h3>Generated Reports</h3><p>{reports.length} indexed reports</p></div>
        {user.role !== "viewer" ? <button className="primary-command compact" disabled={!dataset || isGenerating} onClick={generate} type="button">{isGenerating ? <Loader2 className="spin" size={18} /> : <FileText size={18} />}Generate</button> : null}
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="reports-grid">
        <div className="panel">
          <div className="panel-heading"><div><h3>Report Library</h3><p>Most recent first</p></div><FileText size={20} /></div>
          <div className="report-list">{reports.length ? reports.map((report) => <button key={report.id} onClick={() => openHtmlDocument(() => api.generatedReportHtml(report.id))} type="button"><FileText size={18} /><span><strong>{report.title}</strong><small>{report.created_at ? new Date(report.created_at).toLocaleString() : "n/a"}</small></span></button>) : <div className="empty-copy">No generated reports.</div>}</div>
        </div>
        <div className="panel">
          <div className="panel-heading"><div><h3>Vector Search</h3><p>Ranked report passages</p></div><FileSearch size={20} /></div>
          <form className="question-row report-search" onSubmit={search}><Search size={18} /><input aria-label="Search reports" onChange={(event) => setQuery(event.target.value)} placeholder="Search findings and recommendations" value={query} /><button disabled={isSearching} type="submit">{isSearching ? <Loader2 className="spin" size={18} /> : "Search"}</button></form>
          <div className="search-results">{results.map((result) => <button key={result.report.id} onClick={() => openHtmlDocument(() => api.generatedReportHtml(result.report.id))} type="button"><span><strong>{result.report.title}</strong><small>Relevance {Math.round(result.score * 100)}%</small></span><p>{result.excerpt}</p></button>)}</div>
        </div>
      </div>
    </section>
  );
}
