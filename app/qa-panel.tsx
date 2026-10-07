"use client";

import { useEffect, useState } from "react";

type Issue = { key: string; title: string; description: unknown; attachments: { id: string; filename: string; mimeType: string; size: number }[] };
type Finding = { title: string; severity: string; steps: string[]; expected: string; actual: string; evidence: string };
type Report = { verdict: string; summary: string; commits: { ui: { head: string }; api: { head: string } }; criteria: { criterion: string; status: string; evidence: string }[]; checks: { name: string; status: string; evidence: string }[]; findings: Finding[]; limitations: string[]; documentCoverage?: { filename: string; pagesReviewed: number[]; unreadablePages: number[]; notes: string }[] };
type Run = { id: string; status: string; error?: string; report?: Report };
type RepoInfo = { current: string; head: string; branches: string[]; dirty: boolean };
const endpoint = "http://127.0.0.1:8788";

function BranchField({ label, value, branches, onChange }: { label: string; value: string; branches: string[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = branches.filter(branch => branch.toLowerCase().includes(query.toLowerCase())).slice(0, 40);
  return <label className="qa-branch-field">{label}
    <input value={value} onFocus={() => { setQuery(""); setOpen(true); }} onChange={event => { onChange(event.target.value); setQuery(event.target.value); setOpen(true); }} onKeyDown={event => { if (event.key === "Escape") setOpen(false); }} onBlur={() => window.setTimeout(() => setOpen(false), 150)} autoComplete="off" required />
    {open && branches.length > 0 && <div className="qa-branch-menu" role="listbox" aria-label={`${label} suggestions`}>
      {matches.length ? matches.map(branch => <button type="button" role="option" aria-selected={value === branch} key={branch} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(branch); setOpen(false); }}>{branch}</button>) : <span>No matching local branch</span>}
      {matches.length === 40 && <small>Type to narrow the branch list</small>}
    </div>}
  </label>;
}

export default function QaPanel({ issue }: { issue: Issue }) {
  const [local, setLocal] = useState(false);
  const [ready, setReady] = useState(false);
  const [setup, setSetup] = useState<{ imageReady: boolean; loginPresent: boolean } | null>(null);
  const [repos, setRepos] = useState<{ ui: RepoInfo; api: RepoInfo } | null>(null);
  const [uiRef, setUiRef] = useState("HEAD");
  const [apiRef, setApiRef] = useState("HEAD");
  const [uiBase, setUiBase] = useState("origin/develop");
  const [apiBase, setApiBase] = useState("origin/develop");
  const [uiUrl, setUiUrl] = useState("http://localhost:4200");
  const [apiUrl, setApiUrl] = useState("http://127.0.0.1:8000");
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
    setLocal(true);
    const checkHealth = () => fetch(`${endpoint}/health`, { cache: "no-store" })
      .then(async response => { setReady(response.ok); if (response.ok) setSetup(await response.json()); })
      .catch(() => setReady(false));
    void checkHealth();
    fetch(`${endpoint}/repos`, { cache: "no-store" }).then(async response => {
      if (!response.ok) return;
      const data = await response.json() as { ui: RepoInfo; api: RepoInfo };
      setRepos(data);
      setUiRef(current => current === "HEAD" ? data.ui.current : current);
      setApiRef(current => current === "HEAD" ? data.api.current : current);
      const preferredBase = (branches: string[]) => ["origin/develop", "develop", "origin/main", "main", "origin/master", "master"].find(branch => branches.includes(branch));
      setUiBase(current => data.ui.branches.includes(current) ? current : preferredBase(data.ui.branches) || current);
      setApiBase(current => data.api.branches.includes(current) ? current : preferredBase(data.api.branches) || current);
    }).catch(() => {});
    const timer = window.setInterval(() => { void checkHealth(); }, 8000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!run || run.status !== "running") return;
    const timer = window.setInterval(() => {
      fetch(`${endpoint}/runs/${run.id}`).then(response => response.json()).then(data => setRun(data as Run)).catch(() => setError("Could not check QA run status."));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [run]);

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setRun(null); setPreparing(true);
    try {
      const attachments = [];
      let totalBytes = 0;
      for (const file of issue.attachments) {
        if (file.size > 10_000_000 || totalBytes + file.size > 25_000_000) {
          attachments.push({ ...file, error: "File exceeds the local QA attachment limit" });
          continue;
        }
        try {
          const source = await fetch(`/api/jira/attachment/${encodeURIComponent(file.id)}`, { credentials: "same-origin", cache: "no-store" });
          if (!source.ok) throw new Error(`Jira returned ${source.status}`);
          const bytes = new Uint8Array(await source.arrayBuffer());
          if (bytes.byteLength > 10_000_000 || totalBytes + bytes.byteLength > 25_000_000) throw new Error("File exceeds the local QA attachment limit");
          totalBytes += bytes.byteLength;
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
          attachments.push({ ...file, dataBase64: btoa(binary) });
        } catch (caught) { attachments.push({ ...file, error: caught instanceof Error ? caught.message : "Could not download attachment" }); }
      }
      const response = await fetch(`${endpoint}/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issue: { key: issue.key, title: issue.title, description: issue.description, attachments: issue.attachments }, attachments, ui: { ref: uiRef, base: uiBase }, api: { ref: apiRef, base: apiBase }, urls: { ui: uiUrl, api: apiUrl } }) });
      const data = await response.json() as Run & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not start QA run");
      setRun(data as Run);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not contact the local QA runner"); }
    finally { setPreparing(false); }
  }

  if (!local) return null;
  return <section className="card qa-panel" aria-label="Antigravity QA">
    <div className="panel-head"><div><small>ANTIGRAVITY QA</small><h3>Check this task against the branches</h3></div></div>
    <p className="qa-notice">{issue.attachments.length} Jira attachment{issue.attachments.length === 1 ? "" : "s"} will be included as requirement sources. Files that cannot be read will be listed in the QA limitations.</p>
    <p className="qa-notice">For authenticated checks, Botibot can create temporary accounts for roles found in this task on the verified local app database. The run report will show which roles were provisioned; accounts are removed when QA ends.</p>
    {!ready && <p className="qa-notice">Start the local runner with <code>node qa-runner/server.mjs</code>, then refresh this page.</p>}
    {ready && setup && !setup.imageReady && <p className="qa-notice">Build the QA container first. See <code>qa-runner/README.md</code>, then refresh this page.</p>}
    {ready && setup?.imageReady && !setup.loginPresent && <p className="qa-notice">Sign in to Antigravity inside the QA container once. See <code>qa-runner/README.md</code>, then refresh this page.</p>}
    {repos && <p className="qa-notice">Local branches: UI <strong>{repos.ui.current}</strong> ({repos.ui.head.slice(0, 12)}), API <strong>{repos.api.current}</strong> ({repos.api.head.slice(0, 12)}).{repos.ui.dirty || repos.api.dirty ? " Uncommitted changes are present; this runner tests committed branch snapshots only." : ""}</p>}
    <p className="qa-notice">Choose the task branch as head and the earlier target branch (often <code>origin/develop</code>) as base. Using <code>origin/your-task-branch</code> as base usually produces no change set.</p>
    <form onSubmit={start}>
      <div className="qa-grid">
        <BranchField label="UI branch or commit" value={uiRef} branches={repos?.ui.branches || []} onChange={setUiRef} />
        <BranchField label="UI base" value={uiBase} branches={repos?.ui.branches || []} onChange={setUiBase} />
        <BranchField label="API branch or commit" value={apiRef} branches={repos?.api.branches || []} onChange={setApiRef} />
        <BranchField label="API base" value={apiBase} branches={repos?.api.branches || []} onChange={setApiBase} />
        <label>UI test URL<input type="url" value={uiUrl} onChange={event => setUiUrl(event.target.value)} required /></label>
        <label>API test URL<input type="url" value={apiUrl} onChange={event => setApiUrl(event.target.value)} required /></label>
      </div>
      <button disabled={!ready || !setup?.imageReady || !setup.loginPresent || preparing || run?.status === "running"}>{preparing ? "Loading attachments…" : run?.status === "running" ? "QA running…" : "Run QA"}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {run?.status === "error" && <p className="error" role="alert">{run.error}</p>}
    {run?.report && <div className="qa-report">
      <div className="qa-verdict"><strong>{run.report.verdict.toUpperCase()}</strong><span>{run.report.summary}</span></div>
      <p className="qa-commits">UI {run.report.commits.ui.head.slice(0, 12)} · API {run.report.commits.api.head.slice(0, 12)}</p>
      {run.report.documentCoverage && <><h4>Document coverage</h4>{run.report.documentCoverage.map((item, index) => <div className="qa-row" key={index}><strong>{item.pagesReviewed.length} pages</strong><span>{item.filename}<small>Reviewed: {item.pagesReviewed.join(", ") || "none"}{item.unreadablePages.length ? ` · Unreadable: ${item.unreadablePages.join(", ")}` : ""}{item.notes ? ` · ${item.notes}` : ""}</small></span></div>)}</>}
      <h4>Acceptance criteria</h4>
      {run.report.criteria.map((item, index) => <div className="qa-row" key={index}><strong>{item.status}</strong><span>{item.criterion}<small>{item.evidence}</small></span></div>)}
      <h4>Checks</h4>
      {run.report.checks.map((item, index) => <div className="qa-row" key={index}><strong>{item.status}</strong><span>{item.name}<small>{item.evidence}</small></span></div>)}
      {run.report.findings.length > 0 && <><h4>Findings</h4>{run.report.findings.map((item, index) => <div className="qa-finding" key={index}><strong>{item.severity}: {item.title}</strong><p>{item.actual}</p><small>Expected: {item.expected}</small><ol>{item.steps.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol><small>{item.evidence}</small></div>)}</>}
      {run.report.limitations.length > 0 && <><h4>Limitations</h4><ul>{run.report.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
    </div>}
  </section>;
}
