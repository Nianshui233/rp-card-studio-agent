#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const argumentsSet = new Set(process.argv.slice(2));
for (const argument of argumentsSet) {
  if (argument !== '--check') {
    process.stderr.write(`Unknown option: ${argument}\n`);
    process.exitCode = 2;
    process.exit();
  }
}

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(scriptsDirectory);
const outputPath = path.join(scriptsDirectory, 'rp-card-forge.bundle.mjs');

const result = await build({
  absWorkingDir: repositoryRoot,
  entryPoints: ['scripts/rp-card-forge.mjs'],
  outfile: 'scripts/rp-card-forge.bundle.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['node20'],
  charset: 'ascii',
  external: ['./scripts/rp-card-runtime.mjs'],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'silent',
  write: false,
});

if (result.outputFiles.length !== 1) {
  throw new Error(`Expected one Forge output, received ${result.outputFiles.length}`);
}

const candidate = Buffer.from(result.outputFiles[0].contents);
if (argumentsSet.has('--check')) {
  const current = await readFile(outputPath);
  if (!candidate.equals(current)) {
    process.stderr.write('Forge bundle is stale. Run `npm run build:forge` and commit the regenerated bundle.\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('Forge bundle matches repository source.\n');
  }
} else {
  await writeFile(outputPath, candidate);
  process.stdout.write(`Built ${path.relative(repositoryRoot, outputPath).replaceAll(path.sep, '/')}\n`);
}
