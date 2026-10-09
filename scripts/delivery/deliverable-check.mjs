import fs from 'node:fs';
import { validateDeliveryLayout } from './project-package.mjs';
import path from 'node:path';
import { validateActiveRouteFile } from './active-route.mjs';
import { scanRpFacingFiles } from './artifact-purity-lint.mjs';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const command = process.argv[2];
try {
  if (command === 'layout') {
    const root = path.resolve(option('--root') || process.cwd());
    const result = validateDeliveryLayout(root, { requireManifest: process.argv.includes('--final') });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'active-route') {
    const manifest = option('--manifest');
    if (!manifest) throw new Error('active-route 必须提供 --manifest <manifest.json>');
    const result = validateActiveRouteFile(path.resolve(manifest), { deliveryRoot: option('--root') ? path.resolve(option('--root')) : undefined });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'purity') {
    const files = process.argv.slice(3).filter(item => !item.startsWith('--')).map(file => path.resolve(file));
    if (!files.length) throw new Error('purity 必须提供至少一个 RP-facing 文件');
    const findings = scanRpFacingFiles(files.map(file => ({ path: file, text: fs.readFileSync(file, 'utf8') })));
    const result = { ok: findings.length === 0, findings };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } else {
    throw new Error('用法: node deliverable-check.mjs layout --root <作品项目目录> [--final] | active-route --manifest <制作文件/项目记录/交付清单.json> [--root <delivery-root>] | purity <file>...');
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
