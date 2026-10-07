#!/usr/bin/env node
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.BOTIBOT_QA_PORT || 8788);
const runs = new Map();
const allowedOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost:4173']);
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
function repoInfo(name) {
  const path = join(root, '..', name);
  const git = (...args) => {
    const result = spawnSync('git', ['-C', path, ...args], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
    if (result.status !== 0) throw new Error(`Cannot read ${name} Git checkout`);
    return result.stdout.trim();
  };
  const branches = git('for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes').split('\n').filter(item => item && !item.endsWith('/HEAD'));
  const current = git('branch', '--show-current');
  return { current: current || 'HEAD', head: git('rev-parse', 'HEAD'), branches, dirty: Boolean(git('status', '--porcelain', '--untracked-files=normal')) };
}

createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) return send(res, 403, { error: 'Origin not allowed' });
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && req.url === '/repos') {
    try { return send(res, 200, { ui: repoInfo('app-ui'), api: repoInfo('app-api') }); }
    catch (error) { return send(res, 503, { error: error.message }); }
  }
  if (req.method === 'GET' && req.url === '/health') {
    const imageReady = spawnSync('docker', ['image', 'inspect', 'botibot-qa:local'], { stdio: 'ignore' }).status === 0;
    const loginPresent = imageReady && spawnSync('docker', [
      'run', '--rm', '--network=none', '--read-only',
      '--mount', 'type=volume,source=botibot-agy-home,target=/home/node/.gemini',
      'botibot-qa:local', 'test', '-s', '/home/node/.gemini/antigravity-cli/antigravity-oauth-token',
    ], { stdio: 'ignore' }).status === 0;
    return send(res, 200, { ready: true, imageReady, loginPresent });
  }
  const match = /^\/runs\/([a-f0-9-]+)$/.exec(req.url || '');
  if (req.method === 'GET' && match) {
    const run = runs.get(match[1]);
    return send(res, run ? 200 : 404, run || { error: 'Run not found' });
  }
  if (req.method !== 'POST' || req.url !== '/runs') return send(res, 404, { error: 'Not found' });
  let body = '';
  try {
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 36_000_000) throw new Error('Request too large');
    }
    const input = JSON.parse(body);
    if (!/^[A-Za-z][A-Za-z0-9]+-\d+$/.test(input.issue?.key || '')) throw new Error('Invalid issue key');
    for (const name of ['ui', 'api']) {
      if (typeof input[name]?.ref !== 'string' || typeof input[name]?.base !== 'string') throw new Error(`Missing ${name} branch or base`);
      const url = new URL(input.urls?.[name]);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Invalid ${name} URL`);
    }
    const id = crypto.randomUUID();
    const temporary = mkdtempSync(join(tmpdir(), 'botibot-qa-request-'));
    const inputPath = join(temporary, 'input.json');
    writeFileSync(inputPath, JSON.stringify(input));
    const run = { id, status: 'running', startedAt: new Date().toISOString() };
    runs.set(id, run);
    const child = spawn(process.execPath, [join(root, 'qa-runner', 'run.mjs'), '--input', inputPath], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { Object.assign(run, { status: 'error', error: error.message }); });
    child.on('close', code => {
      try {
        const reportPath = stdout.trim().split('\n').at(-1);
        if (reportPath?.endsWith('/report.json')) {
          run.report = JSON.parse(readFileSync(reportPath, 'utf8'));
          run.status = 'complete';
        } else if (run.status !== 'error') {
          const match = /Error: ([^\n]+)\n\s+at /.exec(stderr);
          Object.assign(run, { status: 'error', error: match?.[1] || stderr.slice(-1000) || `Runner exited ${code}` });
        }
      } catch (error) { Object.assign(run, { status: 'error', error: error.message }); }
      run.finishedAt = new Date().toISOString();
      rmSync(temporary, { recursive: true, force: true });
    });
    return send(res, 202, { id, status: run.status });
  } catch (error) { return send(res, 400, { error: error instanceof Error ? error.message : 'Invalid request' }); }
}).listen(port, '127.0.0.1', () => console.log(`Botibot QA runner listening on http://127.0.0.1:${port}`));
