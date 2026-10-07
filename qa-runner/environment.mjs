import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const composeNames = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];
const inside = (root, path) => relative(root, path) === '' || (!relative(root, path).startsWith('..') && !relative(root, path).startsWith('/'));

function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 15_000, maxBuffer: 8 * 1024 * 1024 });
  return result.status === 0 ? { ok: true, output: result.stdout } : { ok: false, error: (result.error?.message || result.stderr || `exit ${result.status}`).trim().slice(0, 300) };
}

function composeFiles(coreRoot) {
  const directories = [coreRoot, join(coreRoot, 'docker'), join(coreRoot, 'app-ui'), join(coreRoot, 'app-api')];
  return directories.flatMap(dir => composeNames.map(name => join(dir, name)).filter(existsSync));
}

function parseJsonLines(output) {
  const trimmed = output.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed.split('\n').filter(Boolean).map(line => JSON.parse(line));
  }
}

export function inspectEnvironment(coreRoot, checkout) {
  const projects = [];
  for (const file of composeFiles(coreRoot)) {
    const configResult = docker(['compose', '-f', file, 'config', '--no-interpolate', '--format', 'json']);
    if (!configResult.ok) {
      projects.push({ file: relative(coreRoot, file), error: `Compose config unavailable: ${configResult.error}` });
      continue;
    }
    let config;
    try { config = JSON.parse(configResult.output); }
    catch { projects.push({ file: relative(coreRoot, file), error: 'Compose config was not valid JSON' }); continue; }
    const statusResult = docker(['compose', '-f', file, 'ps', '--all', '--format', 'json']);
    let containers = [];
    try { if (statusResult.ok) containers = parseJsonLines(statusResult.output); }
    catch { /* Keep config and report status error below. */ }
    const byService = new Map(containers.map(item => [item.Service, item]));
    const services = Object.entries(config.services || {}).map(([name, service]) => {
      const buildContext = service.build?.context && resolve(service.build.context);
      const dockerfile = buildContext && resolve(buildContext, service.build.dockerfile || 'Dockerfile');
      const mountedSources = (service.volumes || []).filter(volume => volume.type === 'bind' && volume.source && inside(coreRoot, volume.source) && !/^(?:\.env|.+\/\.env)$/.test(relative(coreRoot, volume.source)))
        .map(volume => ({ source: relative(coreRoot, volume.source), target: volume.target }));
      const state = byService.get(name);
      return {
        name,
        buildContext: buildContext && inside(coreRoot, buildContext) ? relative(coreRoot, buildContext) || '.' : null,
        dockerfile: dockerfile && inside(coreRoot, dockerfile) ? relative(coreRoot, dockerfile) : null,
        image: service.image || null,
        dependsOn: Object.keys(service.depends_on || {}),
        bindMounts: mountedSources,
        declaredPorts: (service.ports || []).map(port => typeof port === 'string' ? port : `${port.published}:${port.target}`),
        container: state ? {
          name: state.Name || state.Names,
          state: state.State,
          health: state.Health || null,
          publishedPorts: (state.Publishers || []).filter(port => port.PublishedPort).map(port => `${port.PublishedPort}:${port.TargetPort}`),
        } : null,
      };
    });
    projects.push({ file: relative(coreRoot, file), project: config.name, statusError: statusResult.ok ? null : statusResult.error, services });
  }

  const dockerfiles = new Map();
  for (const [repo, path] of Object.entries(checkout)) {
    const candidates = readdirSync(path, { withFileTypes: true }).filter(item => item.isFile() && /^Dockerfile(?:\..+)?$|^.+\.Dockerfile$/.test(item.name));
    for (const item of candidates) {
      const source = join(path, item.name);
      dockerfiles.set(`app-${repo}/${item.name}`, readFileSync(source, 'utf8').slice(0, 16000));
    }
  }
  for (const project of projects) for (const service of project.services || []) {
    if (!service.dockerfile || dockerfiles.has(service.dockerfile)) continue;
    const source = join(coreRoot, service.dockerfile);
    if (existsSync(source)) dockerfiles.set(service.dockerfile, readFileSync(source, 'utf8').slice(0, 16000));
  }
  return {
    note: 'Compose state is observed on the host. Services with bind mounts from app-ui/app-api run the host working tree, not necessarily the pinned QA commits. Do not attribute live results to pinned commits unless the deployed code SHA is verified.',
    projects,
    dockerfiles: Object.fromEntries(dockerfiles),
  };
}
