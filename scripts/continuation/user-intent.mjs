// Deterministic interpretation boundaries for short user replies.
// This classifier never grants authorization; it only prevents ambiguous replies
// from being recorded as acceptance or a new stage decision.

function normalize(text) {
  return String(text ?? '')
    .trim()
    .replace(/[\s`"'“”‘’。！？!?，,:：；;、（）()\[\]{}<>《》]/g, '');
}

const BARE_CONTINUE = new Set([
  '继续',
  '继续吧',
  '继续进行',
  '继续处理',
  '接着来',
  '接着做',
  '往下做'
]);

export function isBareContinue(text) {
  return BARE_CONTINUE.has(normalize(text));
}

export function classifyUserReply(text) {
  const normalized = normalize(text);
  if (isBareContinue(text)) return { kind: 'bare_continue', normalized };
  if (!normalized) return { kind: 'empty', normalized };
  // Check denial and questions before affirmation, including replies with a subject.
  if (/(不接受|不确认|不同意|不批准|不通过|不认可|不可用|不可以|没通过|没有通过|接受不了|有问题)/.test(normalized)
    || /^(?:我(?:们)?|本人)?(?:现在|目前|暂时|暂|还)?(?:拒绝|否决|退回|不要)/.test(normalized)) {
    return { kind: 'explicit_rejection', normalized };
  }
  if (/[?？]/.test(String(text ?? '')) || /(是否|能否|如果|假如|除非|吗|么)/.test(normalized)) return { kind: 'other', normalized };
  // Acceptance is only explicit when the reply names an acceptance/confirmation
  // action. It still needs a matching handoff and target outside this classifier.
  if (/^(?:我(?:们)?|本人)?(?:现在|已经|已|正式|明确)?(?:接受|确认|同意|批准|通过)/.test(normalized) || /(可以|没问题|没问题了|行了|认可|可用)/.test(normalized)) return { kind: 'explicit_acceptance', normalized };
  if (/^(拒绝|否决|不同意|退回|不要)/.test(normalized)) return { kind: 'explicit_rejection', normalized };
  if (/^(开始|进入|授权|放权)/.test(normalized)) return { kind: 'explicit_authorization', normalized };
  return { kind: 'other', normalized };
}

export function acceptanceEvidenceIssue(evidence, handoffId) {
  if (!evidence || evidence.action !== 'accept') return null;
  if (isBareContinue(evidence.quote)) {
    return `用户接受依据 ${evidence.id} 不能只引用“继续”；它不能关闭阶段或授权下一阶段`;
  }
  if (evidence.responseTo !== handoffId) {
    return `用户接受依据 ${evidence.id} 必须明确回应交接 ${handoffId}`;
  }
  if (classifyUserReply(evidence.quote).kind !== 'explicit_acceptance') {
    return `用户接受依据 ${evidence.id} 必须包含明确的接受/确认语义`;
  }
  return null;
}
