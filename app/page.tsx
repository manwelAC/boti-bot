"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, FileText, LockKeyhole, Paperclip, Search, Sparkles } from "lucide-react";

type Attachment = { id: string; filename: string; mimeType: string; size: number };
type Issue = { key: string; title: string; description: unknown; status: string; type: string; attachments: Attachment[]; jiraUrl: string };
type Connection = { configured: boolean; connected: boolean; siteUrl: string | null };

function adfText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const item = node as { text?: string; type?: string; content?: unknown[] };
  if (item.text) return item.text;
  const text = (item.content || []).map(adfText).join(item.type === "paragraph" ? "" : "\n");
  return item.type === "paragraph" ? `${text}\n` : text;
}

function fileSize(bytes: number) {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

export default function Home() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [key, setKey] = useState("");
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/jira/status", { cache: "no-store" }).then((r) => r.json() as Promise<Connection>).then(setConnection).catch(() => setError("Could not check Jira status."));
    if (new URLSearchParams(location.search).has("jira_error")) setError("Jira could not be connected. Please try again.");
  }, []);

  async function openTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setIssue(null); setError("");
    try {
      const response = await fetch(`/api/jira/issue?key=${encodeURIComponent(key.trim())}`, { cache: "no-store" });
      const data = await response.json() as Issue & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load task");
      setIssue(data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load task"); }
    finally { setLoading(false); }
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon">b.</span><span>Boti-bot</span></div>
      <small>WORKSPACE</small>
      <div className="nav-item"><FileText size={17}/> Task documents</div>
      <div className="sidebar-card"><Sparkles size={20}/><strong>From task to context</strong><p>Bring the original Jira documents into one clear workspace before tracing a branch.</p></div>
      <div className="private"><LockKeyhole size={15}/> Private workspace</div>
    </aside>
    <main>
      <header className="topbar"><span>Workspace <b>/</b> <strong>Task documents</strong></span><span className={`pill ${connection?.connected ? "is-connected" : ""}`}><i/>{connection?.connected ? "Jira connected" : connection?.configured ? "Jira disconnected" : "Jira setup needed"}</span></header>
      <div className="content">
        <div className="intro"><small>BOTI-BOT / TASK WORKSPACE</small><h1>Start with the source document.</h1><p>Find a Jira task, review its attached files, and keep the original requirements in view before any branch analysis.</p></div>
        <section className="card search-card" aria-label="Find a Jira task">
          <div className="card-title"><span className="card-icon"><Search size={19}/></span><div><h2>Find a Jira task</h2><p>Enter its issue key to bring in the task and attachments.</p></div></div>
          <form onSubmit={openTask}><label htmlFor="key">Jira issue key</label><div className="search-row"><input id="key" value={key} onChange={(event) => setKey(event.target.value)} placeholder="e.g. SM360-1551" autoComplete="off" spellCheck={false}/><button disabled={!connection?.connected || !key.trim() || loading}>{loading ? "Loading…" : <>Open task <ArrowRight size={16}/></>}</button></div></form>
          {!connection?.configured && <div className="notice">Boti-bot is ready. The site owner needs to configure Jira access before tasks can be opened.</div>}
          {connection?.configured && !connection.connected && <div className="connect"><span>Connect your Jira account to read tasks you can access.</span><a href="/api/jira/connect">Connect Jira <ArrowUpRight size={15}/></a></div>}
          {error && <div className="error" role="alert">{error}</div>}
        </section>
        {issue ? <>
          <section className="card issue"><div className="issue-meta"><span>{issue.key}</span><em>{issue.status || issue.type || "Jira task"}</em></div><h2>{issue.title}</h2><a href={issue.jiraUrl} target="_blank" rel="noreferrer">View original in Jira <ArrowUpRight size={15}/></a></section>
          <div className="columns"><section className="card panel"><div className="panel-head"><div><small>SOURCE MATERIAL</small><h3>Attachments <span>{issue.attachments.length}</span></h3></div><Paperclip size={20}/></div>{issue.attachments.length ? <div className="attachment-list">{issue.attachments.map((file) => <a key={file.id} href={`/api/jira/attachment/${file.id}`} target="_blank" rel="noreferrer" className="attachment"><span className="file-icon"><FileText size={20}/></span><span><strong>{file.filename}</strong><small>{fileSize(file.size)} · {file.mimeType || "File"}</small></span><ArrowUpRight size={16}/></a>)}</div> : <p className="empty">No files are attached to this task.</p>}</section><section className="card panel"><div className="panel-head"><div><small>TASK CONTEXT</small><h3>Jira description</h3></div><FileText size={20}/></div><p className="description">{adfText(issue.description).trim() || "This task has no description. Review its attached documents for the requirements."}</p></section></div>
        </> : <section className="waiting"><span><Paperclip size={25}/></span><h2>Your task documents will appear here</h2><p>Open a Jira task to see its original attachments alongside its task details.</p></section>}
        <div className="next"><b>01</b><span><strong>First, understand the document.</strong><small>Branch tracing and requirement checks will follow once the source documents are available here.</small></span></div>
      </div>
    </main>
  </div>;
}
