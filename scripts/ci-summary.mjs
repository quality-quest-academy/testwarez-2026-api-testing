import { appendFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const [group, status, directory] = process.argv.slice(2);
if (!process.env.GITHUB_STEP_SUMMARY) throw new Error('GitHub summary path is required');
const lines = [`## ${group}: ${status}`, '', 'See step logs and the scoped 7-day diagnostic artifact.', ''];
async function visit(path) {
  let entries;
  try { entries = await readdir(path, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) await visit(file);
    else if (entry.name === 'junit.xml') {
      const xml = await readFile(file, 'utf8');
      const totals = xml.match(/<testsuites?\s[^>]*>/)?.[0] ?? 'No JUnit totals';
      lines.push(`- \`${file}\`: \`${totals.replace(/[<>`]/g, '')}\``);
    } else if (entry.name === 'cleanup.json') {
      const cleanup = JSON.parse(await readFile(file, 'utf8'));
      lines.push(`- \`${cleanup.project}\`: cleanup ${cleanup.removed ? 'verified' : '**FAILED**'}`);
    }
  }
}
if (directory) await visit(directory);
await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
