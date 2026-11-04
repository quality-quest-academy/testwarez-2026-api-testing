import { appendFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const purposes = {
  Static: ['OpenAPI lint, TypeScript checks and frontend build.', 'Static/build checks only; no runtime behavior is tested.'],
  Isolated: ['Unit, isolated API and local backend integration tests.', 'Fresh local stores and controlled HTTP dependencies; not Compose wiring or live NBP.'],
  Contracts: ['Targeted response examples and bounded Schemathesis generation.', 'Schema conformance is not exhaustive business correctness or live-provider compatibility.'],
  'Compose system': ['Lifecycle diagnostics/cleanup probes, three backend scenarios and one Chromium journey.', 'Controlled mock NBP; no private row/call counts or live-provider guarantee.'],
};

// Count testcase evidence once, not both testsuites and nested testsuite totals.
// These are the JUnit dialects emitted by the pinned Vitest, Playwright and Schemathesis runners.
export function junitTotals(xml) {
  if (!xml) return null;
  const clean = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  if (!/<testsuites?\b/.test(clean) || !/<\/testsuites?>\s*$/.test(clean.trim())) return null;
  const cases = [...clean.matchAll(/<testcase\b[^>]*(?:\/>|>[\s\S]*?<\/testcase>)/g)].map((match) => match[0]);
  const root = clean.match(/<testsuites?\b[^>]*>/)?.[0];
  const declared = root?.match(/\btests=["'](\d+)["']/)?.[1];
  if (declared !== undefined && Number(declared) !== cases.length) return null;
  return {
    tests: cases.length,
    failures: cases.filter((test) => /<(?:failure|error)\b/.test(test)).length,
    skipped: cases.filter((test) => /<skipped\b/.test(test)).length,
  };
}

function json(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function totalsText(totals) {
  return totals ? `${totals.tests} cases, ${totals.failures} failed/error, ${totals.skipped} skipped` : 'totals unavailable (missing/partial JUnit)';
}

function testResult(totals, command) {
  if (command === 'failure' || totals?.failures) return '**FAILED**';
  if (command === 'skipped' || command === 'cancelled') return `${command}; not a pass`;
  if (!totals || !totals.tests) return 'unavailable/not run; not a pass';
  if (totals.skipped) return 'partial/skipped; not a full pass';
  return command === 'success' ? 'passed' : 'passed JUnit evidence (command outcome unavailable)';
}

export function renderSummary(group, status, files = {}, outcomes = {}, directory = '', artifactUrl = '') {
  const [purpose, limitation] = purposes[group] ?? ['Unknown check group.', 'No interpretation available.'];
  const paths = Object.keys(files).filter((file) => group !== 'Isolated' || /^(unit|api|integration)\//.test(file));
  const location = (file) => `\`${[directory, file].filter(Boolean).join('/')}\``;
  const lines = [`## ${group} — job outcome: ${status}`, '', purpose, '', `Limitation: ${limitation}`, '',
    'Diagnostics: workflow step logs (including setup/build failures).'];
  if (paths.length) {
    const artifact = { Isolated: 'isolated-results', Contracts: 'contract-results', 'Compose system': 'compose-results' }[group];
    if (artifact) lines.push(artifactUrl
      ? `Diagnostics: [${artifact}](${artifactUrl}) (seven-day retention); files under ${location('')}.`
      : `Existing output: ${location('')}; \`${artifact}\` artifact unavailable. Check the upload step and workflow logs.`);
  } else if (directory) lines.push('No output files available; no diagnostic artifact is promised.');
  lines.push('');
  const suite = (label, file, command) => {
    const totals = junitTotals(files[file]);
    lines.push(`- **${label}**: ${testResult(totals, command)} — ${totalsText(totals)}. ${files[file] ? location(file) : 'Use step logs; report absent.'}`);
  };
  if (group === 'Static') {
    for (const [key, label] of [['lint', 'OpenAPI lint'], ['types', 'TypeScript'], ['build', 'Frontend build']]) {
      lines.push(`- ${label}: ${outcomes[key] || 'unavailable/not run'}.`);
    }
    lines.push('', 'No test totals or test artifact: this job does not execute runtime tests.');
  } else if (group === 'Isolated') {
    for (const [key, label] of [['unit', 'Vitest units'], ['api', 'Playwright isolated API'], ['integration', 'Playwright local integration']]) {
      suite(label, `${key}/junit.xml`, outcomes[key]);
    }
  } else if (group === 'Contracts') {
    suite('Playwright contract orchestration/examples', 'junit.xml', outcomes.contracts);
    for (const service of ['products', 'orders']) {
      const reports = paths.filter((file) => /\/schemathesis\/junit(?:-[^/]+)?\.xml$/.test(file) && file.includes(service));
      if (reports.length === 1) {
        suite(`Schemathesis ${service} JUnit operation cases (not Playwright totals)`, reports[0]);
        const log = reports[0].replace(/junit[^/]*\.xml$/, 'schemathesis.log');
        const countLine = files[log]?.match(/Test cases:\s*\r?\n([^\r\n]+)/)?.[1];
        const counts = [...(countLine ?? '').matchAll(/\b\d+ (?:generated|passed|failed|skipped)\b/g)].map((match) => match[0]);
        lines.push(`  - Generated request totals: ${counts.length ? counts.join(', ') : 'unavailable/partial'}. Separate from operation and Playwright counts.${log in files ? ` ${location(log)}` : ''}`);
      } else lines.push(`- **Schemathesis ${service} JUnit operation cases**: unavailable/not run — ${reports.length ? 'ambiguous reports' : 'report absent'}; use contract step logs.`);
    }
  } else if (group === 'Compose system') {
    lines.push(`Build: ${outcomes.build || 'unavailable/not run'}. Lifecycle command: ${outcomes.probes || 'unavailable/not run'}. Business command: ${outcomes.system || 'unavailable/not run'}.`, '', '### Lifecycle probes (not business passes)');
    const scenarios = ['assertion-probe', 'startup-probe', 'checkout', 'stale-price', 'stale-version', 'browser'];
    for (const name of scenarios) {
      if (name === 'checkout') lines.push('', '### Business scenarios');
      const file = (base) => `${name}/${base}`;
      const outcome = json(files[file('outcome.json')]);
      const cleanup = json(files[file('cleanup.json')]);
      const totals = junitTotals(files[file('junit.xml')]);
      const removed = typeof outcome?.project === 'string' && cleanup?.removed === true && Array.isArray(cleanup.errors) && cleanup.errors.length === 0 && cleanup.project === outcome.project && outcome.cleanupFailure === null;
      let result;
      if (name.endsWith('-probe')) {
        const phase = name === 'assertion-probe' ? 'test' : 'startup';
        const diagnostics = ['up.log', 'state.log', 'logs.log', 'down.log'].every((base) => file(base) in files);
        let expected = false;
        if (phase === 'test') {
          expected = totals?.tests === 1 && totals.failures === 1 && /<failure\b[\s\S]*Deliberate lifecycle probe[\s\S]*<\/failure>/.test(files[file('junit.xml')]) && file('playwright.log') in files;
        } else {
          try {
            const states = files[file('state.log')].trim().split(/\r?\n/).filter(Boolean).flatMap((line) => JSON.parse(line));
            expected = states.some((state) => state.Service === 'orders-api' && state.State === 'exited' && state.ExitCode === 42)
              && ['products-api', 'nbp-mock'].every((service) => states.some((state) => state.Service === service && state.State === 'running' && state.Health === 'healthy'));
          } catch { /* Missing or partial state is not verified evidence. */ }
        }
        result = outcome && outcome.phase === phase && outcome.expectedFailure === phase && outcome.failure && removed && diagnostics && expected
          ? 'verified expected failure + diagnostics + cleanup (not a business pass)'
          : outcome ? '**NOT VERIFIED** (unexpected failure/success or incomplete diagnostics/cleanup)' : 'unavailable/not run; not verified';
      } else {
        result = !outcome ? 'unavailable/not run; not a pass'
          : outcome.failure || outcome.cleanupFailure || outcome.expectedFailure || totals?.failures || cleanup?.removed === false ? '**FAILED**'
            : !removed || outcome.phase !== 'test' || outcome.failure !== null || outcome.expectedFailure !== null ? 'partial evidence; not a pass' : testResult(totals, 'success');
      }
      const label = { 'stale-price': 'stale-price/version', 'stale-version': 'stale-version-only' }[name] ?? name;
      lines.push(`- **${label}**: ${result}. ${name === 'startup-probe' ? 'JUnit not applicable to startup verification.' : totalsText(totals) + '.'} Cleanup: ${removed ? 'verified' : 'failed/unavailable'}. ${paths.some((path) => path.startsWith(`${name}/`)) ? location(name) : 'Use step logs; output absent.'}`);
    }
    lines.push('', `Fallback cleanup command: ${outcomes.fallback || 'unavailable/not run'}.`);
    for (const name of scenarios) {
      const file = `${name}/fallback/cleanup.json`;
      const fallback = json(files[file]);
      const original = json(files[`${name}/outcome.json`]);
      lines.push(`- ${name} fallback: ${typeof original?.project === 'string' && fallback?.removed === true && Array.isArray(fallback.errors) && fallback.errors.length === 0 && fallback.project === original.project ? 'verified' : fallback?.removed === false ? '**FAILED**' : 'unavailable/not run'}${files[file] ? ` — ${location(file)}` : ''}.`);
    }
    lines.push('', 'The reporter never rewrites original probe JUnit/logs. Missing later scenarios are not passes. Fallback evidence does not replace original cleanup evidence.');
  }
  return `${lines.join('\n')}\n`;
}

async function collect(directory, prefix = '', files = {}) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return files; throw error; }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const key = `${prefix}${entry.name}`;
    if (entry.isDirectory()) await collect(path, `${key}/`, files);
    else files[key] = /^(junit(?:-[^/]+)?\.xml|outcome\.json|cleanup\.json|state\.log|schemathesis\.log)$/.test(entry.name) ? await readFile(path, 'utf8') : '';
  }
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [group, status, directory] = process.argv.slice(2);
  if (!process.env.GITHUB_STEP_SUMMARY) throw new Error('GitHub summary path is required');
  const files = directory ? await collect(directory) : {};
  const summary = renderSummary(group, status, files, json(process.env.CI_STEP_OUTCOMES) ?? {}, directory, process.env.CI_ARTIFACT_URL);
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary);
}
