"use client";

import { FileSearch, FileText, Loader2, Search } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, Notify, ProgressState } from "@/components/FeedbackStates";
import { api, Dataset, GeneratedReport, openHtmlDocument, ReportSearchResult, User } from "@/lib/api";

export function ReportsView({ dataset, user, onNotify }: { dataset: Dataset | null; user: User; onNotify: Notify }) {
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [results, setResults] = useState<ReportSearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try { setReports(await api.reports()); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Could not load reports."); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => { void loadReports(); }, [loadReports]);

  async function generate() {
    if (!dataset) return;
    setIsGenerating(true);
    setError("");
    try {
      const queued = await api.queueReport(dataset.id);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const job = await api.job(queued.job_id);
        if (job.status === "success") {
          await loadReports();
          onNotify(`Report generated for ${dataset.original_filename}.`, "success");
          return;
        }
        if (job.status === "failure") throw new Error(job.error ?? "Report generation failed.");
        await new Promise((resolve) => window.setTimeout(resolve, 750));
      }
      throw new Error("Report generation is still running. Refresh the report list shortly.");
    } catch (generateError) {
      const message = generateError instanceof Error ? generateError.message : "Report generation failed.";
      setError(message);
      onNotify(message, "error");
    } finally { setIsGenerating(false); }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    setHasSearched(true);
    setError("");
    try { setResults(await api.searchReports(query.trim())); }
    catch (searchError) { setError(searchError instanceof Error ? searchError.message : "Report search failed."); }
    finally { setIsSearching(false); }
  }

  async function openReport(reportId: string) {
    try { await openHtmlDocument(() => api.generatedReportHtml(reportId)); }
    catch (openError) { onNotify(openError instanceof Error ? openError.message : "Could not open the report.", "error"); }
  }

  if (isLoading) return <ProgressState title="Loading report library" detail="Retrieving generated reports and search index status." />;
  if (error && !reports.length) return <ErrorState message={error} onRetry={() => void loadReports()} />;
  return (
    <section className="reports-view">
      <div className="report-toolbar"><div><h3>Generated Reports</h3><p>{reports.length} indexed reports</p></div>{user.role !== "viewer" ? <button className="primary-command compact" disabled={!dataset || isGenerating} onClick={() => void generate()} type="button">{isGenerating ? <Loader2 aria-hidden="true" className="spin" size={18} /> : <FileText aria-hidden="true" size={18} />}{isGenerating ? "Generating" : "Generate"}</button> : null}</div>
      {isGenerating ? <ProgressState title="Generating operational report" detail="The report is being analyzed and indexed. This view updates automatically." /> : null}
      {error ? <ErrorState message={error} onRetry={() => void loadReports()} /> : null}
      <div className="reports-grid">
        <section className="panel"><div className="panel-heading"><div><h3>Report Library</h3><p>Most recent first</p></div><FileText aria-hidden="true" size={20} /></div>{reports.length ? <div className="report-list">{reports.map((report) => <button key={report.id} onClick={() => void openReport(report.id)} type="button"><FileText aria-hidden="true" size={18} /><span><strong>{report.title}</strong><small>{report.created_at ? new Date(report.created_at).toLocaleString() : "Date unavailable"}</small></span></button>)}</div> : <EmptyState title="No generated reports" detail="Generate a report for the selected dataset to build the report library." />}</section>
        <section className="panel"><div className="panel-heading"><div><h3>Report Search</h3><p>Ranked findings and recommendations</p></div><FileSearch aria-hidden="true" size={20} /></div><form aria-busy={isSearching} className="question-row report-search" onSubmit={search}><Search aria-hidden="true" size={18} /><input aria-label="Search reports" onChange={(event) => setQuery(event.target.value)} placeholder="Search findings and recommendations" value={query} /><button disabled={isSearching} type="submit">{isSearching ? <Loader2 aria-hidden="true" className="spin" size={18} /> : "Search"}</button></form>{isSearching ? <ProgressState title="Searching reports" /> : results.length ? <div className="search-results">{results.map((result) => <button key={result.report.id} onClick={() => void openReport(result.report.id)} type="button"><span><strong>{result.report.title}</strong><small>Relevance {Math.round(result.score * 100)}%</small></span><p>{result.excerpt}</p></button>)}</div> : hasSearched ? <EmptyState title="No matching reports" detail="Try a broader phrase or generate more reports to expand the index." /> : <EmptyState title="Search the report library" detail="Find related findings, anomalies, and recommendations across generated reports." />}</section>
      </div>
    </section>
  );
}
