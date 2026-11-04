import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// One owner manifest per job; fallback cleanup never enumerates developer projects.
const root = resolve('test-results/compose');
const manifest = resolve(root, 'projects.json');
const tag = process.env.CI_IMAGE_TAG;
if (!tag || !/^[a-z0-9][a-z0-9_.-]{0,80}$/.test(tag)) throw new Error('Set a unique lowercase CI_IMAGE_TAG (e.g. local-kan15-1)');
await mkdir(root, { recursive: true });
const common = ['compose', '--env-file', '.env.example', '-f', 'compose.yaml', '-f', 'compose.ci.yaml'];
const services = ['products-api', 'orders-api', 'nbp-mock', 'frontend'];

async function command(bin, args, { log, env = {}, allowFailure = false, timeout = 120_000 } = {}) {
  console.log(`> ${bin} ${args.join(' ')}`);
  let output = '';
  const code = await new Promise((done, reject) => {
    const child = spawn(bin, args, { env: { ...process.env, ...env }, windowsHide: true });
    child.on('error', reject);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });
    const timer = setTimeout(() => child.kill(), timeout);
    child.on('close', (status) => { clearTimeout(timer); done(status); });
  });
  if (log) await writeFile(log, output);
  if (code !== 0 && !allowFailure) throw new Error(`${bin} failed (${code}); see ${log ?? 'console'}`);
  return { code, output };
}

async function ownedProjects() {
  try { return JSON.parse(await readFile(manifest, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

async function cleanup(project, directory) {
  // All diagnostics happen before down, even for partly created/unhealthy stacks.
  const errors = [];
  for (const [name, args] of [
    ['state', [...common, '-p', project, 'ps', '--all', '--format', 'json']],
    ['containers', ['ps', '-a', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.ID}} {{.Names}} {{.Status}}']],
    ['logs', [...common, '-p', project, 'logs', '--no-color', '--timestamps']],
    ['down', [...common, '-p', project, 'down', '--volumes', '--remove-orphans', '--timeout', '10']],
  ]) {
    try {
      const result = await command('docker', args, { log: resolve(directory, `${name}.log`), allowFailure: true });
      if (result.code !== 0) errors.push(`${name}: ${result.code}`);
    } catch (error) { errors.push(String(error)); }
  }
  // Verify removal, rather than assuming a successful `down` means no residue.
  for (const resource of ['container', 'volume', 'network']) {
    try {
      const result = await command('docker', [resource, 'ls', ...(resource === 'container' ? ['--all'] : []), '-q', '--filter', `label=com.docker.compose.project=${project}`],
        { log: resolve(directory, `remaining-${resource}.log`) });
      if (result.output.trim()) errors.push(`Owned ${resource} remains: ${result.output}`);
    } catch (error) { errors.push(String(error)); }
  }
  await writeFile(resolve(directory, 'cleanup.json'), JSON.stringify({ project, removed: errors.length === 0, errors }, null, 2));
  if (errors.length) throw new Error(`Diagnostics/cleanup failed: ${errors.join('; ')}`);
}

if (process.argv.includes('--cleanup')) {
  const failures = [];
  for (const { project, directory } of await ownedProjects()) {
    // Don't overwrite the original pre-teardown diagnostics on fallback cleanup.
    const fallback = resolve(directory, 'fallback');
    await mkdir(fallback, { recursive: true });
    try { await cleanup(project, fallback); } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, 'Fallback cleanup failed');
} else if (process.argv.includes('--build')) {
  await command('docker', [...common, '-p', `kan15-${tag}-build`, 'build', ...services],
    { log: resolve(root, 'build.log'), timeout: 600_000 });
} else {
  const verifyFailures = process.argv.includes('--verify-failures');
  const scenarios = verifyFailures ? [
    { name: 'assertion-probe', file: 'failure.spec.ts', expected: 'test' },
    { name: 'startup-probe', expected: 'startup' },
  ] : [
    { name: 'checkout', file: 'backend.spec.ts', grep: 'multi-item checkout' },
    { name: 'stale-price', file: 'backend.spec.ts', grep: 'stale price and version requires explicit reconfirmation' },
    { name: 'stale-version', file: 'backend.spec.ts', grep: 'stale version only requires explicit reconfirmation' },
    { name: 'browser', file: 'browser.spec.ts' },
  ];
  for (const scenario of scenarios) {
    const project = `kan15-${tag}-${scenario.name}`;
    const directory = resolve(root, scenario.name);
    await mkdir(directory, { recursive: true });
    const owned = await ownedProjects();
    if (owned.some((entry) => entry.project === project)) throw new Error('Use a new CI_IMAGE_TAG for each run');
    // Reject a pre-existing project: never adopt/delete someone else's data.
    for (const resource of ['container', 'volume', 'network']) {
      const result = await command('docker', [resource, 'ls', ...(resource === 'container' ? ['--all'] : []), '-q', '--filter', `label=com.docker.compose.project=${project}`]);
      if (result.output.trim()) throw new Error(`Project already exists: ${project}`);
    }
    owned.push({ project, directory });
    await writeFile(manifest, JSON.stringify(owned, null, 2));
    const args = [...common, '-p', project];
    let phase = 'startup';
    let failure;
    let cleanupFailure;
    try {
      if (scenario.expected === 'startup') {
        // Start some healthy containers/volumes before forcing Orders to exit.
        await command('docker', [...args, 'up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '90', 'products-api', 'nbp-mock'],
          { log: resolve(directory, 'partial-up.log') });
        const override = resolve(directory, 'startup-failure.yaml');
        await writeFile(override, 'services:\n  orders-api:\n    command: ["node", "-e", "process.exit(42)"]\n');
        args.push('-f', override);
      }
      await command('docker', [...args, 'up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '90', ...services],
        { log: resolve(directory, 'up.log'), timeout: 120_000 });
      // ps records project/service IDs and readiness before any public requests.
      await command('docker', [...common, '-p', project, 'ps', '--all', '--format', 'json'], { log: resolve(directory, 'ready.log') });
      for (const service of ['products-api', 'orders-api']) {
        const result = await command('docker', [...common, '-p', project, 'ps', '-q', service]);
        await command('docker', ['inspect', '--format', '{{json .Mounts}}', result.output.trim()],
          { log: resolve(directory, `${service}-mounts.json`) });
      }
      phase = 'test';
      await command(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.compose.config.ts', scenario.file,
        ...(scenario.grep ? ['--grep', scenario.grep] : [])], {
        log: resolve(directory, 'playwright.log'), timeout: 90_000,
        env: { COMPOSE_TEST_PROJECT: project, COMPOSE_TEST_TARGET: 'loopback-containers', COMPOSE_REPORT_DIR: directory },
      });
    } catch (error) { failure = error; }
    finally {
      try { await cleanup(project, directory); } catch (error) { cleanupFailure = error; }
      await writeFile(resolve(directory, 'outcome.json'), JSON.stringify({ project, phase,
        expectedFailure: scenario.expected ?? null, failure: failure ? String(failure) : null,
        cleanupFailure: cleanupFailure ? String(cleanupFailure) : null }, null, 2));
    }
    if (cleanupFailure) throw cleanupFailure;
    if (scenario.expected) {
      if (!failure || phase !== scenario.expected) throw new Error(`Expected ${scenario.expected} failure, observed ${failure ?? 'success'} in ${phase}`);
      if (scenario.expected === 'test') {
        const report = await readFile(resolve(directory, 'junit.xml'), 'utf8');
        if (!report.includes('Deliberate lifecycle probe')) throw new Error('Probe failed for an unintended reason');
      } else {
        const logs = await readFile(resolve(directory, 'state.log'), 'utf8');
        if (!logs.includes('42')) throw new Error('Startup probe did not record the intended exit status');
      }
      console.log(`Verified expected ${scenario.expected} failure, retained diagnostics, and removed ${project}`);
    } else if (failure) throw failure;
  }
}
