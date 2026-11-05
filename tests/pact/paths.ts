import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Separate from Playwright's outputDir: both projects need the generated file.
export const pactDirectory = fileURLToPath(new URL('../../test-results/pact/contracts/', import.meta.url));
export const pactFile = join(pactDirectory, 'Orders-Products.json');
