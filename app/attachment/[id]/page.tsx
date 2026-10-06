"use client";

import { ArrowLeft, ExternalLink, FileText, Sparkles } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import "../../document.css";

export default function AttachmentWorkspace() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const filename = params.get("name") || "Jira attachment";
  const mimeType = params.get("type") || "application/pdf";
  const sourceUrl = `/api/jira/attachment/${id}`;

  return <main className="document-workspace">
    <header className="document-topbar"><a href="/" className="back-link"><ArrowLeft size={16}/> Back to task</a><span className="document-brand"><span className="brand-icon">b.</span> Boti-bot</span><a href={sourceUrl} target="_blank" rel="noreferrer" className="open-source">Open original <ExternalLink size={15}/></a></header>
    <div className="document-layout">
      <section className="document-preview"><div className="document-heading"><div><small>SOURCE DOCUMENT</small><h1>{filename}</h1><p>{mimeType} · Read directly from Jira</p></div><FileText size={22}/></div>{mimeType.toLowerCase().includes("pdf") ? <iframe title={filename} src={sourceUrl} className="pdf-frame"/> : <div className="unsupported"><FileText size={30}/><h2>Preview is not available for this file type</h2><a href={sourceUrl} target="_blank" rel="noreferrer">Download the original file</a></div>}</section>
      <aside className="reading-panel"><div className="reading-kicker"><Sparkles size={17}/> BOTI-BOT READING</div><h2>Understand the source first</h2><p>This document is the requirement source for the task. The next step is to extract its contents into a readable Markdown brief before checking the frontend, backend, and their connection.</p><div className="reading-status"><span>01</span><div><strong>Original document</strong><small>Available in the viewer</small></div></div><div className="reading-status pending"><span>02</span><div><strong>Markdown brief</strong><small>Document reading is the next build step</small></div></div><div className="reading-status pending"><span>03</span><div><strong>Branch flow and QA</strong><small>Uses the approved brief as context</small></div></div></aside>
    </div>
  </main>;
}
