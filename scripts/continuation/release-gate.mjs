const REQUIRED_REAL_HOST = 'passed';

export function releaseReadinessIssues(summary = {}) {
  const issues = [];
  if (summary['real-sillytavern'] !== REQUIRED_REAL_HOST) issues.push('真实 SillyTavern 导入/运行未通过，不能进入 release-ready');
  if (summary.human !== REQUIRED_REAL_HOST) issues.push('用户人工验收未通过，不能进入 release-ready');
  if (summary.release !== REQUIRED_REAL_HOST) issues.push('release 摘要未标记 passed，不能进入 release-ready');
  return issues;
}

export function assertReleaseReady(summary) {
  const issues = releaseReadinessIssues(summary);
  if (issues.length) throw new Error(issues.join('\n'));
  return true;
}
