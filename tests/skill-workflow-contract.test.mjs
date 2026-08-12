import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
const openaiConfig = parseYaml(readFileSync(new URL('../agents/openai.yaml', import.meta.url), 'utf8'));
const preflight = readFileSync(new URL('../references/project-preflight.md', import.meta.url), 'utf8');
const stageEngine = readFileSync(new URL('../references/stage-engine.md', import.meta.url), 'utf8');
const boundaries = readFileSync(new URL('../references/stage-boundaries.md', import.meta.url), 'utf8');
const delegation = readFileSync(new URL('../references/delegation-and-locking.md', import.meta.url), 'utf8');
const statusUi = readFileSync(new URL('../references/stages/status-ui.md', import.meta.url), 'utf8');

test('skill remains explicit-only and rejects natural-language auto invocation', () => {
  assert.equal(openaiConfig?.policy?.allow_implicit_invocation, false);
  assert.doesNotMatch(skill, /^(?:disable-model-invocation|compatibility):/m);
  assert.match(skill, /only when the user selects the skill or explicitly invokes `\$rp-card-studio`/i);
  assert.match(skill, /Words such as "create", "character", "worldbuilding", or "SillyTavern" are never sufficient triggers/);
});

test('first turn is restricted to the five project preflight decisions', () => {
  const entryGate = skill.match(/## Invocation Gate(?<body>[\s\S]*?)## Sources of Truth/)?.groups?.body;
  assert.ok(entryGate, 'SKILL.md entry gate section is missing');
  for (const required of ['project workspace', 'NSFW', 'operation type', 'existing materials', 'target deliverables']) {
    assert.ok(entryGate.includes(required), `entry gate is missing: ${required}`);
  }
  assert.match(entryGate, /Do not ask about premise, world rules, characters, systems, plot, or UI during preflight/);
  assert.match(preflight, /项目预检是每次调用的第一阶段/);
  assert.match(preflight, /只允许询问以下事项/);
  assert.match(preflight, /工作区.*NSFW.*任务类型.*已有材料.*交付目标/s);
});

test('stage loop requires questions, recommendations, user choice, fragments, and a closing summary', () => {
  const loop = skill.match(/## Per-Stage Conversation Loop(?<body>[\s\S]*?)## NSFW Switch/)?.groups?.body;
  assert.ok(loop, 'SKILL.md stage loop section is missing');
  assert.match(loop, /Ask multiple questions belonging only to this stage/);
  assert.match(loop, /materially different directions, consequences, and one reasoned recommendation/);
  assert.match(loop, /Wait for the user to select or supplement/);
  assert.match(loop, /list newly locked decisions and generate a fragment suitable for the maintained source files/);
  assert.match(loop, /provide a complete stage summary, omission check, risks, cross-stage todos, and recommended next-stage directions/);
  assert.match(stageEngine, /多项问题与信息采集 \+ 方向与推荐 -> 用户选定 -> 生成可合并片段/);
});

test('stage boundaries forbid asking later-stage questions early', () => {
  assert.match(skill, /continue with questions from this stage only/);
  assert.match(skill, /Do not read later-stage files merely to appear comprehensive/);
  assert.match(boundaries, /世界观[\s\S]*具体角色心理[\s\S]*数值公式[\s\S]*代码[\s\S]*UI/);
  assert.match(boundaries, /用户主动提供[\s\S]*跨阶段待办/);
});

test('the skill treats the card as a complete RP package rather than a required single character', () => {
  assert.match(skill, /complete RP package/);
  assert.match(skill, /`project\.yaml \+ src\/` is the project/);
  assert.match(skill, /card JSON\/PNG is a deployment container/);
  assert.match(skill, /host field is an adapter slot, not proof that its label owns the content/);
  assert.match(skill, /top-level thing being designed is always the RP project\/package/);
  assert.match(skill, /character is one optional content module/);
  assert.match(skill, /Never invent a "card character"/);
  assert.match(skill, /no fixed character at all/);
  assert.match(skill, /character stage remains a required inventory checkpoint/);
  assert.match(skill, /may lock zero authored characters/);
  assert.equal(openaiConfig?.interface?.short_description, '分阶段共创并交付可验证的 SillyTavern 完整 RP 项目包');
});

test('full AI delegation locks decisions without asking again', () => {
  assert.match(skill, /explicitly delegates a scope to AI, decide all remaining items in that scope/);
  assert.match(skill, /report what was decided and why, lock it immediately, and never ask about it again unless the user reopens it/);
  assert.match(delegation, /AI.*授权[\s\S]*报告[\s\S]*理由[\s\S]*锁定/);
});

test('MVU and EJS remain one optional stage with a direct skip path', () => {
  assert.match(skill, /MVU\/EJS \(optional\)/);
  assert.match(skill, /ask only whether to enter or skip it, not its internal design questions/);
  assert.match(skill, /creates no disabled placeholders or pseudo-implementation/);
  assert.match(skill, /proceeds to `narrative_opening`/);
});

test('basic status UI defaults to character regex and advanced message iframes stay unverified', () => {
  assert.match(skill, /Default to a SillyTavern character regex for read-only, on-message plain text or simple static HTML with no commands or tabs/);
  assert.match(skill, /Tavern Helper message iframe only as an opt-in advanced `host_required` candidate/);
  assert.match(skill, /it is not reliable until the target host proves that the iframe document navigates, its script executes/);
  assert.match(statusUi, /默认并优先锁定 `adapter: sillytavern_regex` 与 `level: embedded`/);
  assert.match(statusUi, /\{\{format_message_variable::stat_data\.path\}\}/);
  assert.match(statusUi, /SillyTavern 1\.18\.0 \+ Tavern Helper 4\.9\.1/);
  assert.match(statusUi, /开启酒馆助手 `渲染 -> 启用 Blob URL 渲染` 时，消息 iframe 可能为空/);
});

test('MVU host acceptance checks Tavern Helper Blob URL rendering before diagnosing card scripts', () => {
  assert.match(skill, /酒馆助手.*渲染.*启用 Blob URL 渲染.*关闭/s);
  assert.match(skill, /refresh or reload SillyTavern before testing MVU initialization/i);
  assert.match(statusUi, /开启.*MVU.*角色脚本.*无法启动/s);
  assert.match(statusUi, /关闭.*启用 Blob URL 渲染.*刷新/s);
});
