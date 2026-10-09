import path from 'node:path';
import { readJson } from './mvu-source-tools.mjs';
import { buildMvuZodProject, validateMvuZodSourceContract } from './validate-mvu-zod-source-contract.mjs';
function option(name) { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
try {
  const root = path.resolve(option('--root') || process.cwd());
  const contract = readJson(root, option('--contract') || '制作文件/项目记录/mvu-source-contract.json');
  const command = process.argv[2];
  const result = command === 'build' ? await buildMvuZodProject(contract, { root, outputDir: option('--out') })
    : command === 'validate' ? await validateMvuZodSourceContract(contract, { root })
      : (() => { throw new Error('用法：mvu-zod-project.mjs build|validate --root 项目目录 [--contract 项目内合同路径]'); })();
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.ok === false) process.exitCode = 1;
} catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
