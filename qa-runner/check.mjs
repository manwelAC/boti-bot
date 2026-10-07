#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectEnvironment } from './environment.mjs';

const botibotRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const coreRoot = resolve(botibotRoot, '..');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const results = [];
const check = (name, ok, detail, required = true) => results.push({ name, ok, detail, required });
const command = (bin, argv, timeout = 10000) => spawnSync(bin, argv, { encoding: 'utf8', timeout, maxBuffer: 1024 * 1024 });

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
check('Node.js >= 22.13', nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 13), process.version);
for (const repo of ['app-ui', 'app-api']) {
  const path = join(coreRoot, repo);
  const result = command('git', ['-C', path, 'rev-parse', '--is-inside-work-tree']);
  check(`${repo} Git checkout`, result.status === 0, result.status === 0 ? path : 'Repository unavailable');
}
const docker = command('docker', ['info', '--format', '{{.ServerVersion}}']);
check('Docker daemon', docker.status === 0, docker.status === 0 ? docker.stdout.trim() : (docker.error?.message || docker.stderr || 'Unavailable').trim().slice(0, 180));
const compose = command('docker', ['compose', 'version', '--short']);
check('Docker Compose', compose.status === 0, compose.status === 0 ? compose.stdout.trim() : 'Unavailable');
const agy = resolve(process.env.BOTIBOT_AGY_BINARY || join(process.env.HOME || '', '.local/bin/agy'));
check('Antigravity CLI binary', existsSync(agy), agy);
if (docker.status === 0) {
  const image = command('docker', ['image', 'inspect', 'botibot-qa:local']);
  check('Botibot QA image', image.status === 0, image.status === 0 ? 'botibot-qa:local' : 'Build with: docker build -t botibot-qa:local -f qa-runner/Dockerfile qa-runner');
  if (image.status === 0) {
    const login = command('docker', ['run', '--rm', '--network=none', '--read-only', '--mount', 'type=volume,source=botibot-agy-home,target=/home/node/.gemini', 'botibot-qa:local', 'test', '-s', '/home/node/.gemini/antigravity-cli/antigravity-oauth-token']);
    check('QA container Antigravity sign-in', login.status === 0, login.status === 0 ? 'Saved' : 'Run: node qa-runner/login.mjs');
  }
}
check('Botibot npm dependencies', existsSync(join(botibotRoot, 'node_modules')), existsSync(join(botibotRoot, 'node_modules')) ? 'Installed' : 'Run npm install in boti-bot');
for (const [label, url] of [['Local QA service', 'http://127.0.0.1:8788/health'], ['Botibot app', 'http://127.0.0.1:5173/']]) {
  const probe = command('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '2', url], 4000);
  check(label, probe.status === 0 && probe.stdout.trim() !== '000', probe.status === 0 ? `HTTP ${probe.stdout.trim()}` : `Not responding at ${url}`, false);
}
if (docker.status === 0 && compose.status === 0) {
  const environment = inspectEnvironment(coreRoot, { ui: join(coreRoot, 'app-ui'), api: join(coreRoot, 'app-api') });
  const found = environment.projects.filter(item => item.services);
  check('Compose project discovery', found.length > 0, found.length ? found.map(item => item.file).join(', ') : 'No Compose project found; Dockerfile-only repos can still be inspected', false);
  for (const project of found) {
    const services = project.services.filter(service => ['app-ui', 'app-api'].includes(service.buildContext));
    for (const service of services) check(`${project.file}: ${service.name}`, service.container?.state === 'running', service.container ? `${service.container.state}${service.container.health ? ` (${service.container.health})` : ''}` : 'Not started', false);
  }
}
for (const [label, flag] of [['UI test URL', '--ui-url'], ['API test URL', '--api-url']]) {
  const value = option(flag);
  if (!value) continue;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Expected HTTP(S)');
    const probe = command('curl', ['-sS', '-L', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '5', value], 7000);
    check(label, probe.status === 0, probe.status === 0 ? `HTTP ${probe.stdout.trim()}` : 'Unreachable or timed out', false);
  } catch (error) { check(label, false, error.message, false); }
}
for (const item of results) console.log(`${item.ok ? 'PASS' : item.required ? 'FAIL' : 'WARN'}  ${item.name}: ${item.detail}`);
console.log('\nWARN items may prevent live or branch-specific QA; FAIL items must be fixed before Run QA.');
if (results.some(item => item.required && !item.ok)) process.exitCode = 1;
