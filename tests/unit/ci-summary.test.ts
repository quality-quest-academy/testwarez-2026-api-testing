import { describe, expect, it } from 'vitest';
// @ts-expect-error Native Node reporting script has no TypeScript declaration.
import { junitTotals, renderSummary } from '../../scripts/ci-summary.mjs';

const passed = '<testsuites tests="1"><testsuite tests="1"><testcase name="checkout"/></testsuite></testsuites>';
const failed = '<testsuites tests="1"><testsuite tests="1"><testcase name="checkout"><failure message="wrong total"><![CDATA[expected 915.90]]></failure></testcase></testsuite></testsuites>';
const probeFailure = failed.replace('wrong total', 'Deliberate lifecycle probe');

function scenario(name: string, failure: string | null = null, expectedFailure: string | null = null): Record<string, string> {
  const project = `disposable-${name}`;
  return {
    [`${name}/outcome.json`]: JSON.stringify({ project, phase: 'test', expectedFailure, failure, cleanupFailure: null }),
    [`${name}/cleanup.json`]: JSON.stringify({ project, removed: true, errors: [] }),
    [`${name}/fallback/cleanup.json`]: JSON.stringify({ project, removed: true, errors: [] }),
    [`${name}/junit.xml`]: failure ? failed : passed,
    ...Object.fromEntries(['up.log', 'state.log', 'logs.log', 'down.log', 'playwright.log'].map((file) => [`${name}/${file}`, 'sanitized diagnostic'])),
  };
}

describe('CI summary evidence (pure, synthetic fixtures; no services)', () => {
  it('counts nested JUnit cases once and ignores diagnostic text that looks like XML', () => {
    expect(junitTotals(passed)).toEqual({ tests: 1, failures: 0, skipped: 0 });
    expect(junitTotals(failed.replace('expected 915.90', '<testcase><failure/></testcase>'))).toEqual({ tests: 1, failures: 1, skipped: 0 });
    expect(junitTotals('<testsuite tests="2"><testcase><error/></testcase><testcase><skipped/></testcase></testsuite>'))
      .toEqual({ tests: 2, failures: 1, skipped: 1 });
    expect(junitTotals('<testsuites><testsuite tests="1"><testcase/></testsuite><testsuite tests="1"><testcase/></testsuite></testsuites>'))
      .toEqual({ tests: 2, failures: 0, skipped: 0 });
  });

  it('does not invent zero-test success for missing, truncated or inconsistent reports', () => {
    for (const report of [undefined, '', '<testsuites tests="1">', '<testsuites tests="2"><testcase/></testsuites>']) {
      expect(junitTotals(report)).toBeNull();
    }
    expect(renderSummary('Isolated', 'failure')).toContain('totals unavailable');
    expect(renderSummary('Isolated', 'success', { 'unit/junit.xml': '<testsuites tests="0"></testsuites>' })).toContain('not a pass');
  });

  it('labels static checks accurately and promises no test artifact', () => {
    const text = renderSummary('Static', 'failure', {}, { lint: 'success', types: 'failure', build: 'skipped' });
    expect(text).toContain('job outcome: failure');
    expect(text).toContain('TypeScript: failure');
    expect(text).toContain('Frontend build: skipped');
    expect(text).toContain('no runtime behavior is tested');
    expect(text).not.toContain('seven-day');
  });

  it('keeps suite totals separate and respects failed/skipped command outcomes', () => {
    const text = renderSummary('Isolated', 'failure', { 'unit/junit.xml': passed, 'api/junit.xml': failed },
      { unit: 'success', api: 'failure', integration: 'skipped' }, 'test-results');
    expect(text).toContain('Vitest units**: passed — 1 cases');
    expect(text).toContain('Playwright isolated API**: **FAILED** — 1 cases, 1 failed/error');
    expect(text).toContain('Playwright local integration**: skipped; not a pass — totals unavailable');
    expect(text).toContain('`test-results/api/junit.xml`');
    expect(text).toContain('artifact unavailable. Check the upload step');
    expect(renderSummary('Isolated', 'success', { 'unit/junit.xml': passed }, { unit: 'success' }, 'test-results', 'https://example.invalid/artifact'))
      .toContain('[isolated-results](https://example.invalid/artifact) (seven-day retention)');
    expect(renderSummary('Isolated', 'failure', { 'unit/junit.xml': passed }, { unit: 'failure' })).toContain('Vitest units**: **FAILED**');
  });

  it('distinguishes contract orchestration totals from generated case totals', () => {
    const text = renderSummary('Contracts', 'success', {
      'junit.xml': passed,
      'results/generated-checks-products/schemathesis/junit-20261104T223123Z.xml': passed,
      'results/generated-checks-products/schemathesis/schemathesis.log': 'Test cases:\n  67 generated, 67 passed\nReports:',
    }, { contracts: 'success' });
    expect(text).toContain('contract orchestration/examples**: passed — 1 cases');
    expect(text).toContain('Schemathesis products JUnit operation cases (not Playwright totals)');
    expect(text).toContain('Generated request totals: 67 generated, 67 passed. Separate from operation and Playwright counts.');
    expect(text).toContain('Schemathesis orders JUnit operation cases**: unavailable/not run');
  });

  it('reports real business success only with completed test and cleanup evidence', () => {
    const text = renderSummary('Compose system', 'success', scenario('checkout'));
    expect(text).toContain('checkout**: passed. 1 cases');
    expect(text).toContain('stale-price/version**: unavailable/not run; not a pass');
    expect(text).toContain('stale-version-only**: unavailable/not run; not a pass');
    expect(text).toContain('checkout fallback: verified');
  });

  it('never reclassifies a genuine business failure as an expected probe failure', () => {
    const text = renderSummary('Compose system', 'failure', scenario('checkout', 'assertion mismatch'));
    expect(text).toContain('checkout**: **FAILED**. 1 cases, 1 failed/error');
    expect(text).not.toContain('verified expected failure +');
  });

  it('verifies intentional assertion failure without changing the failed JUnit', () => {
    const files = scenario('assertion-probe', 'command failed (1)', 'test');
    files['assertion-probe/junit.xml'] = probeFailure;
    const before = JSON.stringify(files);
    expect(renderSummary('Compose system', 'success', files)).toContain('assertion-probe**: verified expected failure + diagnostics + cleanup (not a business pass). 1 cases, 1 failed/error');
    expect(JSON.stringify(files)).toBe(before);
    for (const missing of ['junit.xml', 'logs.log', 'cleanup.json', 'outcome.json']) {
      const partial = { ...files };
      delete partial[`assertion-probe/${missing}`];
      expect(renderSummary('Compose system', 'failure', partial)).not.toContain('verified expected failure +');
    }
    files['assertion-probe/junit.xml'] = failed;
    expect(renderSummary('Compose system', 'failure', files)).toContain('assertion-probe**: **NOT VERIFIED**');
  });

  it('requires exact startup failure and healthy partial-stack diagnostics', () => {
    const files = scenario('startup-probe', 'docker failed (1)', 'startup');
    files['startup-probe/outcome.json'] = JSON.stringify({ project: 'disposable-startup-probe', phase: 'startup', expectedFailure: 'startup', failure: 'docker failed (1)', cleanupFailure: null });
    delete files['startup-probe/junit.xml'];
    const states = [
      { Service: 'orders-api', State: 'exited', ExitCode: 42 },
      { Service: 'products-api', State: 'running', Health: 'healthy' },
      { Service: 'nbp-mock', State: 'running', Health: 'healthy' },
    ];
    files['startup-probe/state.log'] = states.map((state) => JSON.stringify(state)).join('\n');
    expect(renderSummary('Compose system', 'success', files)).toContain('startup-probe**: verified expected failure + diagnostics + cleanup (not a business pass). JUnit not applicable');
    files['startup-probe/state.log'] = JSON.stringify(states.slice(0, 2));
    expect(renderSummary('Compose system', 'failure', files)).toContain('startup-probe**: **NOT VERIFIED**');
  });

  it('handles absent/malformed/partial evidence without masking the original failed job', () => {
    const text = renderSummary('Compose system', 'failure', { 'checkout/outcome.json': '{truncated' });
    expect(text).toContain('job outcome: failure');
    expect(text).toContain('checkout**: unavailable/not run; not a pass');
    expect(text).toContain('browser fallback: unavailable/not run');
    expect(renderSummary('Contracts', 'failure', {}, {}, 'missing-output')).toContain('no diagnostic artifact is promised');
    const files = scenario('checkout');
    files['checkout/cleanup.json'] = JSON.stringify({ project: 'disposable-checkout', removed: false, errors: ['owned volume remains'] });
    expect(renderSummary('Compose system', 'failure', files)).toContain('checkout**: **FAILED**');
    expect(renderSummary('Compose system', 'failure', files)).toContain('checkout fallback: verified');
    files['checkout/cleanup.json'] = '{}';
    expect(renderSummary('Compose system', 'failure', files)).toContain('checkout**: partial evidence; not a pass');
  });
});
