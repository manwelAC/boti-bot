#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const agy = process.env.BOTIBOT_AGY_BINARY || join(process.env.HOME || '', '.local/bin/agy');
if (!existsSync(agy)) {
  console.error('Antigravity CLI was not found. Set BOTIBOT_AGY_BINARY to the path of agy.');
  process.exit(1);
}
const image = spawnSync('docker', ['image', 'inspect', 'botibot-qa:local'], { stdio: 'ignore' });
if (image.status !== 0) {
  console.error('QA container is not built. Run: docker build -t botibot-qa:local -f qa-runner/Dockerfile qa-runner');
  process.exit(1);
}

console.log('Opening Antigravity sign-in in the QA container. Follow the URL/code instructions shown below.');
console.log('After sign-in, type /exit or press Ctrl+D, then refresh Botibot.');
spawnSync('docker', [
  'run', '--rm', '-it', '--network', 'host', '--read-only',
  '--cap-drop=ALL', '--security-opt=no-new-privileges',
  '--tmpfs', '/tmp:rw,exec,mode=1777',
  '--tmpfs', '/home/node/.cache:rw,exec,mode=700',
  '--mount', 'type=volume,source=botibot-agy-home,target=/home/node/.gemini',
  '--mount', `type=bind,source=${agy},target=/usr/local/bin/agy,readonly`,
  'botibot-qa:local', 'agy',
], { stdio: 'inherit' });

const saved = spawnSync('docker', [
  'run', '--rm', '--network=none', '--read-only',
  '--mount', 'type=volume,source=botibot-agy-home,target=/home/node/.gemini',
  'botibot-qa:local', 'test', '-s', '/home/node/.gemini/antigravity-cli/antigravity-oauth-token',
], { stdio: 'ignore' }).status === 0;
if (!saved) {
  console.error('No Antigravity login was saved. Run this command again and complete the sign-in.');
  process.exit(1);
}
console.log('Antigravity login saved in the QA container. Refresh Botibot and click Run QA.');
