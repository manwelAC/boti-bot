<div align="center">

# Boti-bot

**Bring Jira task documents into focus and verify branch implementations with autonomous QA.**

A focused, document-first workspace, automated Antigravity QA verification engine, and MCP context bridge crafted with Next.js 16, Cloudflare Workers, Tailwind CSS, and Drizzle.

<br />

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Next.js%2016-0070F3?style=flat&logo=nextdotjs&logoColor=white" alt="Platform Next.js 16" />
  <img src="https://img.shields.io/badge/Runtime-Node.js%20%5E22.13-339933?style=flat&logo=nodedotjs&logoColor=white" alt="Runtime Node 22.13+" />
  <img src="https://img.shields.io/badge/Language-TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="Language TypeScript" />
  <img src="https://img.shields.io/badge/Integration-Jira%20OAuth%202.0-0052CC?style=flat&logo=jira&logoColor=white" alt="Integration Jira OAuth 2.0" />
  <img src="https://img.shields.io/badge/Cloud-Cloudflare%20Workers-F38020?style=flat&logo=cloudflare&logoColor=white" alt="Cloud Cloudflare Workers" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/QA%20Engine-Antigravity%20%2B%20Playwright-7C3AED?style=flat&logo=playwright&logoColor=white" alt="QA Engine Antigravity" />
  <img src="https://img.shields.io/badge/Sandbox-Docker%20Isolated-2496ED?style=flat&logo=docker&logoColor=white" alt="Docker Sandbox" />
  <img src="https://img.shields.io/badge/Protocol-MCP%202025--06-8A2BE2?style=flat&logo=json&logoColor=white" alt="Protocol MCP" />
  <img src="https://img.shields.io/badge/Database-D1%20%2B%20Drizzle-4ADE80?style=flat&logo=drizzle&logoColor=black" alt="Database D1 Drizzle" />
  <img src="https://img.shields.io/badge/Styling-Tailwind%20v4-06B6D4?style=flat&logo=tailwindcss&logoColor=white" alt="Styling Tailwind v4" />
  <img src="https://img.shields.io/badge/Tests-Passing-22C55E?style=flat&logo=checkmarx&logoColor=white" alt="Tests Passing" />
</p>

</div>

---

## Overview

**Boti-bot** is an intentional, focused Jira task document workspace and autonomous QA verification bridge designed to eliminate requirement drift without the clutter, friction, or context-switching of traditional project tracking tools.

Unlike general ticketing portals that force you to hunt through attachments and guess acceptance criteria, **Boti-bot is document-first and verification-driven**. Your assigned Jira issues, technical specification attachments, and a dedicated **Antigravity QA phase** live in one unified workspace—providing clear ground truth before tracing code, and automated end-to-end branch verification before merging.

---

## 🧪 The QA Phase (Antigravity QA Engine)

Boti-bot features a dedicated, automated **QA Phase** powered by the Antigravity CLI, Playwright, Chromium, and isolated Docker execution. It bridges the gap between written ticket specifications and actual codebase implementations by checking out target branches and running live end-to-end verification.

```
┌─────────────────────────┐       ┌───────────────────────────────┐       ┌─────────────────────────┐
│   Jira Task & Specs     │  ───► │  Stage 1: Document Review     │  ───► │ Stage 2: App Testing    │
│  • Issue description    │       │  • OCR & text extraction      │       │ • Disposable git trees  │
│  • PDF / DOCX / Images  │       │  • Acceptance criteria map    │       │ • Playwright journeys   │
└─────────────────────────┘       │  • Full document coverage     │       │ • Role provisioning    │
                                  └───────────────────────────────┘       └────────────┬────────────┘
                                                                                       │
                                                                                       ▼
                                                                          ┌─────────────────────────┐
                                                                          │  Structured Audit Log   │
                                                                          │  • Verdict & findings   │
                                                                          │  • Step-by-step proof   │
                                                                          │  • report.json saved    │
                                                                          └─────────────────────────┘
```

### Two-Stage Autonomous Verification

1. **Stage 1: Document Review & Coverage Extraction** *(up to 6 minutes)*
   - Downloads all Jira attachments associated with the task (PDF, DOCX, ODT, images, text) up to 25 MB total.
   - Extracts page-by-page text using native extraction and OCR engines.
   - Synthesizes explicit acceptance criteria and verifies full document review coverage (`document-review.json`). Uncovered or unreadable pages are flagged as limitations.

2. **Stage 2: Live App Verification & Journey Testing** *(up to 10 minutes)*
   - Creates disposable Git worktrees for target commits (`app-ui` and `app-api`) against specified base branches (e.g. `origin/develop`).
   - Discovers local Compose projects, evaluates container health, and inspects pinned Dockerfiles.
   - **Safe Role Provisioning**: Derives required user roles from the task and safely creates temporary test accounts on local/testing databases, cleaning them up after execution.
   - Drives headless Chromium/Playwright browsers inside a read-only Docker container (`botibot-qa:local`) to validate real user journeys against live endpoints (`http://localhost:4200`, `http://127.0.0.1:8000`).

3. **Verdicts & Actionable Reports**
   - Saves complete audit runs under `qa-runs/<run-id>/report.json` with an explicit verdict: **Passed**, **Failed**, or **Inconclusive**.
   - Includes specific cited criteria, step-by-step evidence, reproduction steps, finding severities, and limitations.

---

## Key Capabilities

- **🎯 Task-First Workspace**: Query and inspect Jira issues by key (`e.g. SM360-1551`), view status columns, and render ADF (Atlassian Document Format) descriptions.
- **📎 Attachment & Document Reader**: Direct access to requirement documents, mockups, and uploaded assets before opening any editor.
- **🧪 Antigravity QA Panel**: In-app interface to select UI/API branches, compare against base refs, launch automated QA runs, and stream live verdicts.
- **🤖 Model Context Protocol (MCP)**: Native `/app/mcp` JSON-RPC endpoint serving tools like `get_task_context` and `get_attachment_text` directly to AI coding agents.
- **⚡ Edge & Full-Stack Ready**: Next.js 16 compiled via Vinext / Vite to Cloudflare Workers with optional Cloudflare D1 and Drizzle ORM persistence.
- **🩺 Preflight Health Runner**: Instant environment diagnostics (`npm run qa:check`) checking Docker, Compose, and microservices.

---

## Architecture & Technology Stack

| Capsule | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Next.js `16.3` / React `19` | Modern full-stack React framework with App Router and Server Components |
| **QA Engine** | Antigravity CLI + Playwright | Autonomous agentic QA verification, Chromium journeys, and test generation |
| **QA Sandbox** | Docker (`botibot-qa:local`) | Read-only container with Playwright, Git, OCR, and isolated auth volume |
| **Edge Server** | Cloudflare Workers + Vinext | High-performance edge deployment powered by Vite and Cloudflare Workers |
| **Authentication** | Atlassian OAuth 2.0 (3LO) | Secure OAuth token exchange (`read:jira-work`, `offline_access`) with cookie sessions |
| **AI Protocol** | Model Context Protocol (MCP) | JSON-RPC 2.0 tool provider enabling agentic pairing with IDEs and AI models |
| **Database** | Cloudflare D1 + Drizzle ORM | Serverless SQLite at the edge with lightweight migrations via Drizzle Kit |
| **Design System** | Tailwind CSS v4 + Radix UI | Modern responsive interface, Lucide icons, and spatial task board styling |

---

## Quick Start

### 1. Prerequisites

- **Node.js**: `>=22.13.0`
- **Docker & Docker Compose**: For running the sandboxed QA container and local stacks
- **Antigravity CLI (`agy`)**: Installed at `~/.local/bin/agy` (or configured via `BOTIBOT_AGY_BINARY`)
- **Atlassian Developer App**: Configured for Jira OAuth 2.0 (3LO)

### 2. Environment Configuration

Create or update `.env.local` in `boti-bot/`:

```bash
# Atlassian OAuth 2.0 Credentials
JIRA_CLIENT_ID="your-jira-client-id"
JIRA_CLIENT_SECRET="your-jira-client-secret"
JIRA_SITE_URL="https://your-workspace.atlassian.net"

# Application URL & Session Secret
BOTI_APP_URL="http://localhost:5173"
BOTI_SESSION_KEY="your-random-32-byte-base64-secret"
```

### 3. Setup QA Image & Sign-in (One-Time)

From the `boti-bot/` directory:

```bash
# 1. Build the sandboxed QA runner image
docker build -t botibot-qa:local -f qa-runner/Dockerfile qa-runner

# 2. Complete the container's Antigravity CLI sign-in
node qa-runner/login.mjs
```

### 4. Start Development & QA Services

Run in separate terminals:

```bash
# Terminal 1: Start the local QA daemon (port 8788)
node qa-runner/server.mjs

# Terminal 2: Start the Boti-bot web application (port 5173)
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) to access the workspace.

---

## Running QA Checks

### From the Web UI

1. Open Boti-bot at `http://localhost:5173` and connect your Jira account.
2. Search and open any Jira task (e.g. `SM360-1551`).
3. Scroll down to the **Antigravity QA** panel.
4. Select your target **UI ref/branch** and **API ref/branch**, pick base branches (e.g., `origin/develop`), verify the test URLs (`http://localhost:4200` and `http://127.0.0.1:8000`), and click **Run QA**.
5. Watch real-time execution progress and review the resulting verdicts, findings, and criteria coverage.

### Preflight Diagnostics (CLI)

Verify that your local machine, repositories, and Docker stacks are ready:

```bash
npm run qa:check
```

*Optional probe flags:*
```bash
npm run qa:check -- --ui-url http://127.0.0.1:4200 --api-url http://127.0.0.1:8000
```

### Dry Run (CLI)

Inspect resolved commits and generated prompts without invoking Antigravity:

```bash
node qa-runner/run.mjs --input qa-request.json --dry-run
```

---

## Model Context Protocol (MCP)

Boti-bot exposes a Model Context Protocol endpoint at `/app/mcp` (or `/api/mcp`) supporting JSON-RPC 2.0:

### Available MCP Tools

- **`get_task_context`**: Returns the active Jira task context, summary, and status before reading source code.
- **`get_attachment_text`**: Extracts document text and specs from Jira attachments by `attachment_id`.

### Example MCP Configuration

Add Boti-bot to your AI assistant configuration (`mcp_config.json`):

```json
{
  "mcpServers": {
    "boti-bot": {
      "url": "http://localhost:5173/app/mcp",
      "transport": "http"
    }
  }
}
```

---

## Available Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Launch the Vite / Vinext development server with HMR on port 5173 |
| `npm run qa:check` | Run environment, dependency, and microservice preflight checks |
| `npm run build` | Build the deployable Cloudflare Workers production bundle |
| `npm run start` | Run the built Worker locally via Wrangler with local D1 emulation |
| `npm run db:generate` | Generate Drizzle migrations after schema changes |
| `npm run lint` | Run ESLint across Next.js and TypeScript files |

---

<div align="center">
  <small>Boti-bot • Core Developer Productivity, Task Documents & Autonomous QA</small>
</div>
