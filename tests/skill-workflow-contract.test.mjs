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

test('skill remains explicit-only and rejects natural-language auto invocation', () => {
  assert.equal(openaiConfig?.policy?.allow_implicit_invocation, false);
  assert.doesNotMatch(skill, /^(?:disable-model-invocation|compatibility):/m);
  assert.match(skill, /仅在用户通过技能选择器或 `\$rp-card-studio` 显式调用时执行/);
  assert.match(skill, /不要因为“创建”“角色”“世界观”“SillyTavern”等自然语言自行启动/);
});

test('first turn is restricted to the five project preflight decisions', () => {
  const entryGate = skill.match(/## 入口门(?<body>[\s\S]*?)## 事实源与状态/)?.groups?.body;
  assert.ok(entryGate, 'SKILL.md entry gate section is missing');
  for (const required of ['项目工作区', 'NSFW', '新建、续作、材料转换、修改或审查', '已有材料', '目标交付物']) {
    assert.ok(entryGate.includes(required), `entry gate is missing: ${required}`);
  }
  assert.match(entryGate, /不要在首轮询问题材、世界规则、角色、数值系统、剧情或界面内容/);
  assert.match(preflight, /项目预检是每次调用的第一阶段/);
  assert.match(preflight, /只允许询问以下事项/);
  assert.match(preflight, /工作区.*NSFW.*任务类型.*已有材料.*交付目标/s);
});

test('stage loop requires questions, recommendations, user choice, fragments, and a closing summary', () => {
  const loop = skill.match(/## 阶段内循环(?<body>[\s\S]*?)## AI 放权/)?.groups?.body;
  assert.ok(loop, 'SKILL.md stage loop section is missing');
  for (const requirement of ['一次提出多项本阶段问题', '方向、影响和一个有理由的推荐', '等待用户选定', '本轮新锁定内容', '可进入最终产物的片段', '完整阶段总汇']) {
    assert.ok(loop.includes(requirement), `stage loop is missing: ${requirement}`);
  }
  assert.match(stageEngine, /多项问题与信息采集 \+ 方向与推荐 -> 用户选定 -> 生成可合并片段/);
});

test('stage boundaries forbid asking later-stage questions early', () => {
  assert.match(skill, /只继续询问属于本阶段的问题/);
  assert.match(skill, /不要为了“全面”提前读取后续阶段/);
  assert.match(boundaries, /世界观[\s\S]*具体角色心理[\s\S]*数值公式[\s\S]*代码[\s\S]*UI/);
  assert.match(boundaries, /用户主动提供[\s\S]*跨阶段待办/);
});

test('full AI delegation locks decisions without asking again', () => {
  const aiDelegation = skill.match(/## AI 放权(?<body>[\s\S]*?)## NSFW 开关/)?.groups?.body;
  assert.ok(aiDelegation, 'SKILL.md AI delegation section is missing');
  assert.match(aiDelegation, /授权范围内不再逐项询问/);
  assert.match(aiDelegation, /报告决定内容及理由/);
  assert.match(aiDelegation, /立即写入锁定记录/);
  assert.match(aiDelegation, /后续不再询问/);
  assert.match(delegation, /AI.*授权[\s\S]*报告[\s\S]*理由[\s\S]*锁定/);
});

test('MVU and EJS remain one optional stage with a direct skip path', () => {
  assert.match(skill, /MVU\/EJS（可选）/);
  assert.match(skill, /前一阶段的收尾只决定“进入或跳过”/);
  assert.match(skill, /不进入访谈、不生成禁用片段、依赖说明或阶段总汇/);
  assert.match(skill, /直接把 `narrative_opening` 作为下一阶段/);
});
