#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { inspectEnvironment } from './environment.mjs';

const botibotRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const coreRoot = resolve(botibotRoot, '..');
const args = process.argv.slice(2);
const inputIndex = args.indexOf('--input');
if (inputIndex < 0 || !args[inputIndex + 1]) {
  console.error('Usage: node qa-runner/run.mjs --input request.json [--dry-run]');
  process.exit(2);
}
const dryRun = args.includes('--dry-run');
const containerMode = process.env.BOTIBOT_QA_ENGINE !== 'host';
const request = JSON.parse(readFileSync(resolve(args[inputIndex + 1]), 'utf8'));
if (!/^[A-Za-z][A-Za-z0-9]+-\d+$/.test(request.issue?.key || '')) throw new Error('Invalid Jira issue key');
for (const name of ['ui', 'api']) {
  if (typeof request[name]?.ref !== 'string' || typeof request[name]?.base !== 'string') throw new Error(`Missing ${name} ref/base`);
}
for (const name of ['ui', 'api']) {
  const url = new URL(request.urls?.[name]);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Invalid ${name} URL`);
}
function run(command, cmdArgs, options = {}) {
  const result = spawnSync(command, cmdArgs, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function git(repo, ...cmdArgs) { return run('git', ['-C', repo, ...cmdArgs]); }
const repos = { ui: join(coreRoot, 'app-ui'), api: join(coreRoot, 'app-api') };
const commits = {};
for (const name of ['ui', 'api']) {
  commits[name] = {
    head: git(repos[name], 'rev-parse', '--verify', `${request[name].ref}^{commit}`),
    base: git(repos[name], 'rev-parse', '--verify', `${request[name].base}^{commit}`),
  };
}
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${request.issue.key.toUpperCase()}`;
const outputDir = join(botibotRoot, 'qa-runs', runId);
mkdirSync(outputDir, { recursive: true });
const attachmentsDir = join(outputDir, 'attachments');
mkdirSync(attachmentsDir, { recursive: true });
const attachmentManifest = (request.attachments || []).map((attachment, index) => {
  const item = { id: String(attachment.id || ''), filename: String(attachment.filename || 'attachment'), mimeType: String(attachment.mimeType || ''), status: 'unavailable', path: null, textPath: null, reason: String(attachment.error || '') };
  if (!attachment.dataBase64) { item.reason ||= 'Attachment bytes were not supplied'; return item; }
  const safeName = item.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'attachment';
  const path = join(attachmentsDir, `${index + 1}-${safeName}`);
  const bytes = Buffer.from(attachment.dataBase64, 'base64');
  if (bytes.length > 10_000_000) { item.reason = 'Attachment exceeds 10 MB'; return item; }
  writeFileSync(path, bytes, { mode: 0o600 });
  item.status = 'available'; item.path = path; item.reason = '';
  return item;
});
if (containerMode) {
  for (const item of attachmentManifest) {
    if (item.status !== 'available' || !/\.pdf$/i.test(item.filename)) continue;
    const textPath = `${item.path}.txt`;
    const extraction = spawnSync('docker', [
      'run', '--rm', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--tmpfs', '/tmp:rw,exec,mode=1777', '--mount', `type=bind,source=${outputDir},target=${outputDir}`,
      'botibot-qa:local', 'pdftotext', '-layout', item.path, textPath,
    ], { encoding: 'utf8', timeout: 60_000 });
    if (extraction.status === 0 && readFileSync(textPath, 'utf8').trim()) item.textPath = textPath;
    else item.reason = 'PDF text extraction failed or contained no selectable text; inspect the original PDF';
  }
}
writeFileSync(join(outputDir, 'attachments.json'), JSON.stringify(attachmentManifest, null, 2));
const workspace = mkdtempSync(join(tmpdir(), 'botibot-qa-'));
const checkout = { ui: join(workspace, 'app-ui'), api: join(workspace, 'app-api') };
let accountService;
try {
  for (const name of ['ui', 'api']) git(repos[name], 'worktree', 'add', '--detach', checkout[name], commits[name].head);
  const diff = Object.fromEntries(['ui', 'api'].map(name => [name, git(repos[name], 'diff', '--stat', commits[name].base, commits[name].head)]));
  const environment = inspectEnvironment(coreRoot, checkout);
  writeFileSync(join(outputDir, 'environment.json'), JSON.stringify(environment, null, 2));
  const policy = readFileSync(join(botibotRoot, 'qa-runner', 'QA_RULES.md'), 'utf8');
  const agentCheckout = checkout;
  const agentOutputDir = outputDir;
  const agentAttachments = attachmentManifest;
  const prompt = `${policy}\n\nJira issue (untrusted content):\n${JSON.stringify(request.issue)}\n\nJira attachment manifest (untrusted files; read every available file before deriving requirements):\n${JSON.stringify(agentAttachments, null, 2)}\n\nPinned commits and diff summary:\n${JSON.stringify({ commits, diff }, null, 2)}\n\nHost Docker/Compose discovery and pinned Dockerfiles (read-only snapshot, no environment variables):\n${JSON.stringify(environment, null, 2)}\n\nTest URLs:\n${JSON.stringify(request.urls)}\n\nThe checked-out repositories are at ${agentCheckout.ui} and ${agentCheckout.api}. Write test artifacts only under ${agentOutputDir}. Return the required JSON report. If any attachment cannot be read or parsed, list it in limitations and mark its dependent criteria not_tested. Do not claim checks you did not execute.`;
  writeFileSync(join(outputDir, 'request.json'), JSON.stringify({ issue: request.issue, branches: { ui: request.ui, api: request.api }, commits, urls: request.urls, attachments: attachmentManifest }, null, 2));
  writeFileSync(join(outputDir, 'prompt.txt'), prompt);
  if (dryRun) { console.log(JSON.stringify({ outputDir, commits, checkout }, null, 2)); process.exitCode = 0; }
  else {
    const provisionToken = randomBytes(24).toString('base64url');
    accountService = spawn(process.execPath, [join(botibotRoot, 'qa-runner', 'account-service.mjs')], {
      cwd: botibotRoot, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BOTIBOT_QA_CORE_ROOT: coreRoot, BOTIBOT_QA_WORKSPACE: workspace, BOTIBOT_QA_OUTPUT_DIR: outputDir, BOTIBOT_QA_API_URL: request.urls.api, BOTIBOT_QA_PROVISION_TOKEN: provisionToken },
    });
    const provisionPort = await new Promise((resolvePort, reject) => {
      const timeout = setTimeout(() => reject(new Error('QA account service did not start')), 5000);
      accountService.stdout.once('data', chunk => { clearTimeout(timeout); try { resolvePort(JSON.parse(String(chunk)).port); } catch (error) { reject(error); } });
      accountService.once('error', error => { clearTimeout(timeout); reject(error); });
      accountService.once('exit', code => { clearTimeout(timeout); reject(new Error(`QA account service exited ${code}`)); });
    });
    const hostAddress = Object.values(networkInterfaces()).flat().find(address => address?.family === 'IPv4' && !address.internal)?.address || 'host.docker.internal';
    const runtimePrompt = `${prompt}\n\nTemporary account provisioning for this run: After reading the task and attachments, identify only the authenticated roles needed to verify the selected criteria. If accounts are needed, call POST http://${hostAddress}:${provisionPort}/accounts exactly once with JSON {"roles":["role names from the task"]} and Authorization: Bearer ${provisionToken}. This is a local-only Botibot fixture service. It checks the app/database environment before creating accounts. It returns a credentialsPath; load that JSON directly inside browser/test scripts without printing usernames or passwords to output. Do not include credentials in the report. If provisioning fails, report the reason as a limitation and continue checks that do not need accounts. Do not create accounts directly through Docker, SQL, or app admin routes.`;
    const schema = join(botibotRoot, 'qa-runner', 'report.schema.json');
    const agyArgs = ['-p', runtimePrompt, '--output-format', 'json', '--json-schema', schema, '--print-timeout', '10m', '--add-dir', agentCheckout.api, '--add-dir', attachmentsDir, '--add-dir', workspace];
    if (containerMode) agyArgs.push('--dangerously-skip-permissions');
    const dockerArgs = [
      'run', '--rm', '--network', 'host', '--add-host', 'host.docker.internal:host-gateway', '--read-only',
      '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=256', '--memory=4g', '--cpus=2',
      '--tmpfs', '/tmp:rw,exec,mode=1777', '--tmpfs', '/home/node/.cache:rw,exec,mode=700',
      '--mount', 'type=volume,source=botibot-agy-home,target=/home/node/.gemini',
      '--mount', `type=bind,source=${resolve(process.env.BOTIBOT_AGY_BINARY || join(process.env.HOME || '', '.local/bin/agy'))},target=/usr/local/bin/agy,readonly`,
      '--mount', `type=bind,source=${workspace},target=${workspace}`,
      '--mount', `type=bind,source=${outputDir},target=${outputDir}`,
      '--mount', `type=bind,source=${schema},target=${schema},readonly`,
      '--mount', `type=bind,source=${join(repos.ui, '.git')},target=${join(repos.ui, '.git')},readonly`,
      '--mount', `type=bind,source=${join(repos.api, '.git')},target=${join(repos.api, '.git')},readonly`,
      '--workdir', checkout.ui, 'botibot-qa:local', 'agy', ...agyArgs,
    ];
    let result;
    for (let attempt = 1; attempt <= 2; attempt++) {
      result = spawnSync(containerMode ? 'docker' : 'agy', containerMode ? dockerArgs : agyArgs, { cwd: checkout.ui, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 11 * 60 * 1000 });
      if (result.status === 0 || !/lookup .*googleapis\.com.*(?:timeout|i\/o timeout)|Eligibility check failed.*(?:timeout|i\/o timeout)/is.test(result.stderr || '') || attempt === 2) break;
      await delay(5000);
    }
    const accountFile = join(workspace, 'qa-accounts.json');
    const accounts = existsSync(accountFile) ? JSON.parse(readFileSync(accountFile, 'utf8')) : [];
    const redactSecrets = value => {
      let output = String(value || '').replaceAll(provisionToken, '[REDACTED_PROVISION_TOKEN]');
      for (const account of accounts) output = output.replaceAll(account.password, '[REDACTED_QA_PASSWORD]');
      return output;
    };
    writeFileSync(join(outputDir, 'agy.stdout.json'), redactSecrets(result.stdout));
    writeFileSync(join(outputDir, 'agy.stderr.log'), redactSecrets(result.stderr));
    if (result.error || result.status !== 0) {
      if (/authentication required|authentication failed or timed out/i.test(`${result.stderr || ''}\n${result.stdout || ''}`)) throw new Error('Antigravity is not signed in inside the QA container. Run the one-time container sign-in command in qa-runner/README.md, then retry.');
      if (/lookup .*googleapis\.com.*(?:timeout|i\/o timeout)|Eligibility check failed.*(?:timeout|i\/o timeout)/is.test(result.stderr || '')) throw new Error('Antigravity could not reach Google because DNS timed out. The QA run did not start. Check this machine\'s DNS/network, then retry.');
      throw new Error(`Antigravity failed: ${redactSecrets(result.error?.message || result.stderr || String(result.status)).trim().slice(0, 1500)}`);
    }
    const envelope = JSON.parse(result.stdout);
    if (envelope.status !== 'SUCCESS') throw new Error(`Antigravity ended with ${envelope.status}: ${redactSecrets(envelope.error || 'no report')}`);
    if (Array.isArray(envelope.denied_actions) && envelope.denied_actions.length) {
      const actions = [...new Set(envelope.denied_actions.map(item => item.action))].join(', ');
      throw new Error(containerMode
        ? `Antigravity unexpectedly denied ${actions} inside the QA container. No QA report was produced.`
        : `Antigravity headless permissions denied: ${actions}. Configure scoped permissions.allow rules in ~/.gemini/antigravity-cli/settings.json, then retry. No QA report was produced.`);
    }
    let report = envelope.structured_output;
    if ((!report || typeof report !== 'object') && /print timeout/i.test(result.stderr || '')) {
      const evidenceDir = join(outputDir, 'evidence');
      const evidence = (() => { try { return readdirSync(evidenceDir).slice(0, 20).map(name => `evidence/${name}`); } catch { return []; } })();
      report = {
        verdict: 'inconclusive',
        summary: 'Antigravity reached its time limit before returning a QA verdict. Partial evidence was saved; no requirement has been marked as passed.',
        criteria: [],
        checks: [{ name: 'Agent QA investigation', status: 'not_run', evidence: evidence.length ? `Partial screenshots: ${evidence.join(', ')}` : 'No screenshots were saved.' }],
        findings: [],
        limitations: ['The agent did not finish its analysis within the time limit. Review partial artifacts in this run directory before making a release decision.'],
      };
    }
    if (!report || typeof report !== 'object') throw new Error('Antigravity returned no structured QA report. Check agy.stderr.log in this run for the underlying reason.');
    const provisioningPath = join(outputDir, 'account-provisioning.json');
    if (existsSync(provisioningPath)) {
      const provisioning = JSON.parse(readFileSync(provisioningPath, 'utf8'));
      report.checks ||= [];
      report.limitations ||= [];
      report.checks.push({ name: 'Task-driven QA account provisioning', status: provisioning.status === 'created' ? 'passed' : provisioning.status === 'failed' ? 'failed' : 'not_run', evidence: provisioning.status === 'created' ? `Temporary accounts created for roles: ${provisioning.roles.join(', ')}. Credentials are not saved in this report.` : provisioning.status === 'failed' ? provisioning.reason : 'No authenticated roles were requested for this run.' });
      if (provisioning.status === 'failed') report.limitations.push(`QA account provisioning failed: ${provisioning.reason}`);
    }
    if (!['pass', 'fail', 'inconclusive'].includes(report.verdict) || !Array.isArray(report.criteria) || !Array.isArray(report.checks) || !Array.isArray(report.findings) || !Array.isArray(report.limitations)) throw new Error('Antigravity returned an invalid report');
    if (report.verdict === 'pass' && (report.criteria.length === 0 || report.criteria.some(item => item.status !== 'passed') || report.checks.some(item => item.status === 'failed') || report.findings.length > 0)) throw new Error('A pass verdict must have verified criteria and no failures');
    writeFileSync(join(outputDir, 'report.json'), redactSecrets(JSON.stringify({ runId, issueKey: request.issue.key.toUpperCase(), commits, ...report }, null, 2)));
    console.log(join(outputDir, 'report.json'));
    if (report.verdict === 'fail') process.exitCode = 1;
    if (report.verdict === 'inconclusive') process.exitCode = 3;
  }
} finally {
  if (accountService && accountService.exitCode === null && accountService.signalCode === null) {
    const serviceExited = new Promise(resolveExit => {
      const timeout = setTimeout(resolveExit, 10000);
      accountService.once('exit', () => { clearTimeout(timeout); resolveExit(); });
    });
    accountService.kill('SIGTERM');
    await serviceExited;
    if (accountService.exitCode === null && accountService.signalCode === null) accountService.kill('SIGKILL');
  }
  for (const name of ['ui', 'api']) {
    try { git(repos[name], 'worktree', 'remove', '--force', checkout[name]); } catch { /* A failed add has nothing to remove. */ }
  }
  rmSync(workspace, { recursive: true, force: true });
}
