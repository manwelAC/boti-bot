# Botibot QA runner

Botibot's local QA service checks out the selected `app-ui` and `app-api` commits into disposable Git worktrees, downloads Jira attachments, extracts every page of supported documents, discovers local Compose projects and their container state, and invokes the Antigravity CLI inside a restricted Docker container. The container has Chromium, Playwright, Git, PDF tools, OCR, and Word-to-PDF conversion. The repositories' working files are not mounted; only the disposable worktrees, Git metadata (read-only), and the current run's output directory are available. Antigravity receives a snapshot of Compose service names, build contexts, bind mounts, ports, state, and pinned Dockerfiles; it does not receive the Docker socket or environment variables.

The container has its own Antigravity login volume. It does **not** use or alter the host CLI settings or host login. Headless tool approvals are enabled only inside this container, which has a read-only root filesystem and no extra Linux capabilities. This is a local QA environment; give it only disposable test app URLs and accounts.

## Prerequisites

Run `npm run qa:check` from `boti-bot` to check the local machine. Add `-- --ui-url http://127.0.0.1:4200 --api-url http://127.0.0.1:8000` to probe your own test URLs; the ports shown are examples. The command reports `FAIL` for setup blockers and `WARN` for app services or endpoints that are not ready.

| Needed | Why |
| --- | --- |
| Node.js 22.13 or newer and Botibot npm dependencies (`npm install`) | Runs Botibot and its local QA service. |
| Git checkouts of `app-ui` and `app-api`, with the chosen head and base refs available locally | Creates disposable worktrees for the exact commits under review. Fetch missing remote branches before running QA. |
| Docker daemon and Docker Compose | Builds the QA image and lets the host inspect local app stacks. Compose files may be in the workspace root, `docker/`, or either app repo; Dockerfiles are read from the selected commits. |
| `botibot-qa:local` image and the Antigravity `agy` binary | Runs the signed-in CLI with Chromium, Playwright, Git, and PDF extraction. Set `BOTIBOT_AGY_BINARY` if `agy` is not at `~/.local/bin/agy`. |
| Antigravity sign-in inside the QA container | The host CLI login is separate. Run `node qa-runner/login.mjs` once after building the image. The subscribed account must be able to use the CLI and reach its service over the network. |
| Local Botibot QA service and Botibot app | Start `node qa-runner/server.mjs` and `npm run dev` in separate terminals. The QA service listens on `127.0.0.1:8788`. |
| Jira connection and readable task attachments in Botibot | Supplies the issue description and requirement documents. Files are limited to 10 MB each and 25 MB per run. |
| Disposable UI/API test instances, reachable test URLs, and known code identity | Enables live checks. The runner discovers container state but does not boot services. A running bind-mounted stack may serve a different commit from the selected refs. |
| Safe local test database and suitable task data | Enables authenticated and data-dependent journeys. Botibot can create temporary accounts for roles Gemini identifies from the task when the local database safety checks pass. It does not create student or billing records automatically yet. |

PHP, Composer, frontend dependencies, databases, and other framework tools belong in the relevant **application environment** as defined by its Dockerfile and Compose setup. They are not required in Botibot's QA image. A stack can use another layout; discovery records what exists, and the report explains any checks that remain unavailable.

## One-time setup

From `boti-bot`:

```bash
docker build -t botibot-qa:local -f qa-runner/Dockerfile qa-runner
node qa-runner/login.mjs
```

Open the URL printed in the terminal, sign in with the subscribed account, and paste the authorization code back into the terminal if prompted. Once Antigravity opens, type `/exit` or press `Ctrl+D`. The script checks that the login was saved in Docker volume `botibot-agy-home`. You only need to repeat sign-in if the session expires or the volume is removed. Antigravity's [CLI authentication guide](https://antigravity.google/docs/cli/install#authentication-workflows) describes the account sign-in flow.

## Run QA from Botibot

1. Start disposable `app-ui` and `app-api` test instances, or use an existing local stack whose code version you can identify. The QA runner inspects Compose state but does not boot or rebuild services automatically. If containers bind mount your working tree, their running code may differ from the pinned commits selected for QA.
2. From `boti-bot`, run `node qa-runner/server.mjs`.
3. In another terminal in `boti-bot`, run `npm run dev` and open `http://127.0.0.1:5173/`.
4. Connect Jira, open a task, enter the branch/base refs and test URLs in **Antigravity QA**, then click **Run QA**.

The branch and base fields offer searchable suggestions from local Git branches and remote-tracking refs. Botibot selects each repository's current local branch by default and shows its HEAD commit. Choose the target branch that the task branch was based on (for example `origin/develop`) as **base**; Botibot rejects a run if both repositories' bases resolve to the same commits as their heads. It also warns about uncommitted changes; the current runner tests committed snapshots only, so commit changes before expecting them to appear in QA. Branch suggestions refresh when the QA panel loads. Restart the local QA service after updating its code.

The local service listens only on `127.0.0.1:8788` and accepts browser requests from the local Botibot development origin. Runs are held in memory while the service runs; reports are saved in `qa-runs/<run-id>/report.json`. Keep `qa-runs/` private because it contains task documents and extracted text. The panel is shown only on local Botibot pages.

Botibot downloads Jira attachments through your Jira session and passes them to the loopback runner. The runner accepts up to 10 MB per file and 25 MB per run. PDF, DOC, DOCX, ODT, common image files, and plain text files are processed page by page. Document pages have selectable text where available, OCR text, and a rendered image in the run's attachment folder. Gemini must review every page and return `documentCoverage` in the report. Unsupported, unreadable, or uncovered pages are listed as limitations and prevent a pass verdict. A document may contain requirements in its description, objectives, tables, screenshots, notes, or appendices, not only its functional requirements section.

QA now has two Antigravity stages. Document review runs first (up to six minutes), reads the Jira issue and every attachment page, and saves `document-review.json` with cited criteria and page coverage. App verification then uses that saved checklist, checks up to three priority journeys, and has a separate ten-minute limit. If app verification times out, Botibot keeps the reviewed criteria as `not_tested` and preserves document coverage in an **Inconclusive** report. If document review itself times out, app verification does not start and the report remains **Inconclusive** with no page or criterion claimed as reviewed. Only accounts provisioned for that run may be used for role checks.

For local runs, Gemini may request up to six role names derived from that task's Jira text and attachments. Botibot creates temporary accounts only when the API URL is loopback, the application environment is `local` or `testing`, the database host is the local `core-db` service, and the API and database are running in the same Compose project. Generated passwords live in a temporary file mounted only for that run; saved prompts, logs, and reports redact them. Botibot disables and soft deletes the accounts when the run ends. The current account adapter supports this repository's Lumen `User` model; other application frameworks need their own provisioning adapter. Never point the local app stack at a production database.

Each run saves `environment.json` beside `report.json`. It lists discovered Compose projects and service state without copying local `.env` values. A running service and a reachable URL are recorded separately. If the running containers cannot be tied to the selected commits, live checks cannot pass branch-specific criteria.

Botibot also saves `host-checks.json` for focused PHP tests added or changed by the branch. It runs a test inside the app container only when the container uses the pinned clean checkout and the test explicitly configures in-memory SQLite. Other tests remain unrun until an isolated test database is available. A failing test is reported with its actual assertion; it does not automatically prove a business requirement failed.

The hosted Cloudflare Botibot Site cannot execute Docker or the CLI. A hosted **Run QA** button will need a private runner API or job queue with authentication; this local service is for development testing only.

## Terminal dry run

From `boti-bot`, run `node qa-runner/run.mjs --input qa-request.json --dry-run` to inspect resolved commits and the prompt without invoking Antigravity. Example input:

```json
{
  "issue": { "key": "SM360-1234", "title": "Example", "description": "Acceptance criteria here" },
  "ui": { "ref": "feature/ui", "base": "origin/develop" },
  "api": { "ref": "feature/api", "base": "origin/develop" },
  "urls": { "ui": "http://127.0.0.1:4200", "api": "http://127.0.0.1:8000" }
}
```
