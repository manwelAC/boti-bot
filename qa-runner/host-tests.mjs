import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function command(binary, args, options = {}) {
  return spawnSync(binary, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024, ...options });
}

export function runSafeHostTests(repo, checkout, commits, environment) {
  const result = [];
  const service = environment.projects.flatMap(project => project.services || [])
    .find(item => item.buildContext === 'app-api' && item.container?.state === 'running' && item.bindMounts.some(mount => mount.source === 'app-api'));
  if (!service) return result;
  const head = command('git', ['-C', repo, 'rev-parse', 'HEAD']);
  const dirty = command('git', ['-C', repo, 'status', '--porcelain', '--untracked-files=no']);
  if (head.status !== 0 || head.stdout.trim() !== commits.head || dirty.status !== 0 || dirty.stdout.trim()) {
    return [{ name: 'Application container test execution', status: 'not_run', evidence: 'The running API bind mount does not have a clean checkout at the pinned commit.' }];
  }
  const changed = command('git', ['-C', repo, 'diff', '--name-only', '--diff-filter=ACMRT', commits.base, commits.head, '--', 'tests']);
  if (changed.status !== 0) return result;
  const files = changed.stdout.trim().split('\n').filter(file => /^tests\/[A-Za-z0-9_./-]+Test\.php$/.test(file)).slice(0, 5);
  for (const file of files) {
    const source = readFileSync(join(checkout, file), 'utf8');
    if (!/use\s+PHPUnit\\Framework\\TestCase\s*;/.test(source) || !/['"]database\.default['"]\s*,\s*['"]sqlite['"]/.test(source) || !/['"]:memory:['"]/.test(source)) {
      result.push({ name: `Focused test: ${file}`, status: 'not_run', evidence: 'Test is not clearly isolated to in-memory SQLite; it was not run against the local app database.' });
      continue;
    }
    const test = command('docker', ['exec', '-e', 'DB_CONNECTION=sqlite', '-e', 'DB_DATABASE=:memory:', service.container.name, './vendor/bin/phpunit', '--no-coverage', file], { timeout: 60000 });
    result.push({ name: `Focused test: ${file}`, status: test.status === 0 ? 'passed' : 'failed', evidence: `Ran inside ${service.container.name} with in-memory SQLite. Exit ${test.status ?? 'timeout'}. ${(test.stdout || test.stderr || test.error?.message || '').trim().slice(-2500)}` });
  }
  return result;
}
