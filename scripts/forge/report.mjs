import { ExitCode, normalizeError } from './errors.mjs';

export function successReport(command, data = {}, warnings = [], changes = []) {
  return {
    reportVersion: 1,
    ok: true,
    command,
    code: ExitCode.OK,
    data,
    warnings,
    changes
  };
}
export function errorReport(command, error) {
  const normalized = normalizeError(error);
  return {
    reportVersion: 1,
    ok: false,
    command: command ?? null,
    code: normalized.code,
    error: {
      kind: normalized.kind,
      message: normalized.message,
      ...normalized.details === void 0 ? {} : { details: normalized.details }
    },
    warnings: [],
    changes: []
  };
}
export function printReport(report, jsonMode = false) {
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}
`);
    return;
  }
  if (!report.ok) {
    process.stderr.write(`[${report.error.kind}] ${report.error.message}
`);
    return;
  }
  process.stdout.write(`${report.command}: 完成
`);
  for (const change of report.changes ?? []) {
    process.stdout.write(`  ${change.action}: ${change.path}
`);
  }
  for (const warning of report.warnings ?? []) {
    process.stderr.write(`警告: ${warning}
`);
  }
  if (Object.keys(report.data ?? {}).length > 0) {
    process.stdout.write(`${JSON.stringify(report.data, null, 2)}
`);
  }
}
