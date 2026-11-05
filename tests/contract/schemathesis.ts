import { spawn } from 'node:child_process';

type GeneratedCheck = { service: 'products' | 'orders'; url: string; orderId: string; reports: string };

const enabledChecks = [
  'not_a_server_error',
  'status_code_conformance',
  'content_type_conformance',
  'response_headers_conformance',
  'response_schema_conformance',
];

// Keep CLI mechanics separate from the contract scenario. This watchdog bounds
// the launcher; cross-platform descendant-process supervision remains deferred.
export async function runSchemathesis({ service, url, orderId, reports }: GeneratedCheck) {
  const args = [
    '--python', '3.12', '--from', 'schemathesis==4.32.7', 'schemathesis',
    '--config-file', `tests/contract/${service}.toml`,
    'run', `contracts/${service}.openapi.yaml`, '--url', url,
    '--phases', 'examples,fuzzing', '--mode', 'all',
    '--workers', '1', '--seed', '2026', '--max-examples', '20',
    '--generation-database', 'none', '--request-timeout', '3',
    '--request-retries', '0', '--max-failures', '5',
    '--checks', enabledChecks.join(','),
    '--report', 'junit,har', '--report-dir', reports, '--no-color',
  ];
  console.log(`uvx ${args.join(' ')}`);
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn('uvx', args, {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', CONTRACT_ORDER_ID: orderId },
    });
    let output = '';
    let timedOut = false;
    child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { output += data.toString(); });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 100_000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? null : code, output: timedOut ? `${output}\nSchemathesis launcher exceeded 100 seconds` : output });
    });
  });
}
