#!/usr/bin/env node
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const coreRoot = resolve(process.env.BOTIBOT_QA_CORE_ROOT);
const workspace = resolve(process.env.BOTIBOT_QA_WORKSPACE);
const summaryPath = join(resolve(process.env.BOTIBOT_QA_OUTPUT_DIR), 'account-provisioning.json');
const token = process.env.BOTIBOT_QA_PROVISION_TOKEN;
const apiUrl = new URL(process.env.BOTIBOT_QA_API_URL);
const createdIds = [];
let used = false;

function localGuard() {
  if (!['localhost', '127.0.0.1'].includes(apiUrl.hostname)) throw new Error('Account creation requires a loopback API URL');
  const env = Object.fromEntries(readFileSync(join(coreRoot, '.env'), 'utf8').split(/\r?\n/).filter(line => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)).map(line => {
    const [key, ...rest] = line.split('='); return [key, rest.join('=').trim().replace(/^['"]|['"]$/g, '')];
  }));
  if (!['local', 'testing'].includes(env.APP_ENV) || env.DB_HOST !== 'core-db') throw new Error('Account creation requires APP_ENV=local/testing and the local core-db service');
  const inspect = name => {
    const result = spawnSync('docker', ['inspect', '--format', '{{json .}}', name], { encoding: 'utf8', timeout: 5000, maxBuffer: 2 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`${name} container is unavailable`);
    return JSON.parse(result.stdout);
  };
  const api = inspect('core-api');
  const db = inspect('core-db');
  if (!api.State.Running || !db.State.Running || api.Config.Labels?.['com.docker.compose.project'] !== db.Config.Labels?.['com.docker.compose.project']) throw new Error('API and database must be running in the same local Compose project');
  if (!(api.Mounts || []).some(mount => mount.Destination === '/var/www/html' && mount.Source === join(coreRoot, 'app-api'))) throw new Error('API must bind mount this local app-api checkout');
  if (!(api.Mounts || []).some(mount => mount.Destination === '/var/www/html/.env')) throw new Error('API must mount the local environment file');
  const runtime = spawnSync('docker', ['exec', '-i', 'core-api', 'php'], { input: "<?php $app=require '/var/www/html/bootstrap/app.php'; $app->boot(); echo json_encode(['environment'=>env('APP_ENV'), 'host'=>env('DB_HOST')]);", encoding: 'utf8', timeout: 5000 });
  if (runtime.status !== 0) throw new Error('Could not verify API database configuration');
  const settings = JSON.parse(runtime.stdout);
  if (!['local', 'testing'].includes(settings.environment) || settings.host !== 'core-db') throw new Error('Running API is not connected to the local core-db service');
}

function php(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  const code = `<?php
$app = require '/var/www/html/bootstrap/app.php';
$app->boot();
$data = json_decode(base64_decode('${encoded}'), true);
$db = app('db');
try {
  $db->beginTransaction();
  if ($data['action'] === 'create') {
    $out = [];
    foreach ($data['accounts'] as $account) {
      $role = $account['role'];
      $user = App\\Models\\User::create([
        'username' => $account['username'], 'email' => $account['email'],
        'password' => $account['password'], 'fname' => 'Botibot',
        'lname' => 'QA', 'type' => $role, 'status' => '1',
        'is_banned' => 0, 'force_change_password' => 0,
      ]);
      if (Illuminate\\Support\\Facades\\Schema::hasColumn('users', 'secondary_email_status')) {
        $user->secondary_email_status = 'CONFIRMED'; $user->save();
      }
      $out[] = ['id' => $user->id, 'role' => $role, 'username' => $user->username];
    }
  } else {
    $out = [];
    foreach ($data['ids'] as $id) {
      $user = App\\Models\\User::find($id);
      if ($user && strncmp($user->username, 'botibotqa_', 10) === 0) {
        $user->password = bin2hex(random_bytes(32)); $user->save(); $user->delete();
      }
    }
  }
  $db->commit();
  echo json_encode(['ok' => true, 'accounts' => $out]);
} catch (Throwable $error) {
  $db->rollBack();
  fwrite(STDERR, $error->getMessage());
  exit(1);
}
`;
  const result = spawnSync('docker', ['exec', '-i', 'core-api', 'php'], { input: code, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error((result.stderr || result.error?.message || 'App account creation failed').trim().slice(0, 300));
  return JSON.parse(result.stdout);
}

function cleanup() {
  if (createdIds.length) {
    try { localGuard(); php({ action: 'cleanup', ids: createdIds }); }
    catch (error) { console.error(`QA account cleanup failed: ${error.message}`); }
  }
}

const server = createServer(async (req, res) => {
  const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (req.method !== 'POST' || req.url !== '/accounts' || req.headers.authorization !== `Bearer ${token}`) return send(404, { error: 'Not found' });
  if (used) return send(409, { error: 'QA accounts were already requested for this run' });
  try {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 4000) throw new Error('Request too large'); }
    const requested = JSON.parse(body);
    const roles = [...new Set(requested.roles || [])];
    if (!Array.isArray(requested.roles) || roles.length > 6 || roles.some(role => typeof role !== 'string' || role.length > 80 || !/^[\p{L}\p{N} ._()/-]+$/u.test(role))) throw new Error('Invalid role list');
    used = true;
    if (!roles.length) { writeFileSync(summaryPath, JSON.stringify({ status: 'not_needed', roles: [] }, null, 2)); return send(200, { roles: [], credentialsPath: null }); }
    localGuard();
    const accounts = roles.map((role, index) => {
      const username = `botibotqa_${randomBytes(6).toString('hex')}_${index}`;
      return { role, username, email: `${username}@qa.invalid`, password: randomBytes(24).toString('base64url') };
    });
    const result = php({ action: 'create', accounts });
    createdIds.push(...result.accounts.map(item => item.id));
    const path = join(workspace, 'qa-accounts.json');
    writeFileSync(path, JSON.stringify(accounts), { mode: 0o600 });
    writeFileSync(summaryPath, JSON.stringify({ status: 'created', roles }, null, 2));
    send(200, { roles, credentialsPath: path });
  } catch (error) { writeFileSync(summaryPath, JSON.stringify({ status: 'failed', reason: error.message }, null, 2)); send(400, { error: error.message }); }
});
server.listen(0, '0.0.0.0', () => console.log(JSON.stringify({ port: server.address().port })));
const shutdown = () => { cleanup(); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
setInterval(() => { if (process.ppid === 1) { cleanup(); process.exit(0); } }, 10000).unref();
