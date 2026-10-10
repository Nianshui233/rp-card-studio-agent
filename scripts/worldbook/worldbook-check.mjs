import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATE_DIR, resolveProjectPath } from '../project-layout.mjs';
import { readProjectState } from '../continuation/ledger-transition.mjs';
import { validateStageLedger } from '../continuation/stage-ledger.mjs';
import { validateWorldbookProject } from './worldbook-project.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opt = n => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1]; };
  try {
    const root = path.resolve(opt('--root') || process.cwd()); let ledger;
    // A maintained sample may have only engineering records, not invented user authorizations.
    if (fs.existsSync(path.join(root, STATE_DIR, 'authority.md'))) {
      const state = readProjectState(root); ledger = state.ledger; const checked = validateStageLedger(ledger, state.currentStage); if (!checked.ok) throw new Error(checked.issues.join('\n'));
    }
    const result = validateWorldbookProject(root, opt('--contract') || STATE_DIR + '/worldbook-routing.json', { ledger, requireRuntime: process.argv.includes('--require-runtime') });
    console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1;
  } catch (error) { console.log(JSON.stringify({ ok: false, issues: [error.message], runtime: 'not_run' })); process.exitCode = 1; }
}
