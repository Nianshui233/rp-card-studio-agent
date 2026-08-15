import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse as parseYaml } from "yaml";

const skill = readFileSync(new URL("../SKILL.md", import.meta.url), "utf8");
const openaiConfig = parseYaml(
  readFileSync(new URL("../agents/openai.yaml", import.meta.url), "utf8"),
);
const preflight = readFileSync(
  new URL("../references/project-preflight.md", import.meta.url),
  "utf8",
);
const stageEngine = readFileSync(
  new URL("../references/stage-engine.md", import.meta.url),
  "utf8",
);
const boundaries = readFileSync(
  new URL("../references/stage-boundaries.md", import.meta.url),
  "utf8",
);
const delegation = readFileSync(
  new URL("../references/delegation-and-locking.md", import.meta.url),
  "utf8",
);
const statusUi = readFileSync(
  new URL("../references/stages/status-ui.md", import.meta.url),
  "utf8",
);
const mvuEjs = readFileSync(
  new URL("../references/stages/mvu-ejs.md", import.meta.url),
  "utf8",
);

test("skill remains explicit-only and rejects natural-language auto invocation", () => {
  assert.equal(openaiConfig?.policy?.allow_implicit_invocation, false);
  assert.doesNotMatch(skill, /^(?:disable-model-invocation|compatibility):/m);
  assert.match(
    skill,
    /only when the user selects the skill or explicitly invokes `\$rp-card-studio`/i,
  );
  assert.match(
    skill,
    /Words such as "create", "character", "worldbuilding", or "SillyTavern" are never sufficient triggers/,
  );
});

test("first turn is restricted to the five project preflight decisions", () => {
  const entryGate = skill.match(
    /## Invocation Gate(?<body>[\s\S]*?)## Sources of Truth/,
  )?.groups?.body;
  assert.ok(entryGate, "SKILL.md entry gate section is missing");
  for (const required of [
    "project workspace",
    "NSFW",
    "operation type",
    "existing materials",
    "default single character-card `.json`",
  ]) {
    assert.ok(
      entryGate.includes(required),
      `entry gate is missing: ${required}`,
    );
  }
  assert.match(
    entryGate,
    /Do not ask about premise, world rules, characters, systems, plot, or UI during preflight/,
  );
  assert.match(preflight, /项目预检是每次调用的第一阶段/);
  assert.match(preflight, /只允许询问以下事项/);
  assert.match(preflight, /工作区.*NSFW.*任务类型.*已有材料.*交付目标/s);
});

test("new character-card projects default to one JSON artifact and require explicit opt-in for PNG", () => {
  assert.match(
    skill,
    /lock exactly one `character_card_json` deliverable by default/,
  );
  assert.match(
    skill,
    /include or generate any of them only after the user explicitly requests it/,
  );
  assert.match(preflight, /默认锁定且最终只交付一个角色卡 `\.json`/);
  assert.match(preflight, /工具支持 PNG 不等于默认生成 PNG/);
});

test("stage loop requires questions, recommendations, user choice, fragments, and a closing summary", () => {
  const loop = skill.match(
    /## Per-Stage Conversation Loop(?<body>[\s\S]*?)## NSFW Switch/,
  )?.groups?.body;
  assert.ok(loop, "SKILL.md stage loop section is missing");
  assert.match(loop, /Ask multiple questions belonging only to this stage/);
  assert.match(
    loop,
    /materially different directions, consequences, and one reasoned recommendation/,
  );
  assert.match(loop, /Wait for the user to select or supplement/);
  assert.match(
    loop,
    /list newly locked decisions and generate a fragment suitable for the maintained source files/,
  );
  assert.match(
    loop,
    /provide a complete stage summary, omission check, risks, cross-stage todos, and recommended next-stage directions/,
  );
  assert.match(
    stageEngine,
    /多项问题与信息采集 \+ 方向与推荐 -> 用户选定 -> 生成可合并片段/,
  );
});

test("stage boundaries forbid asking later-stage questions early", () => {
  assert.match(skill, /continue with questions from this stage only/);
  assert.match(
    skill,
    /Do not read later-stage files merely to appear comprehensive/,
  );
  assert.match(
    boundaries,
    /世界观[\s\S]*具体角色心理[\s\S]*数值公式[\s\S]*代码[\s\S]*UI/,
  );
  assert.match(boundaries, /用户主动提供[\s\S]*跨阶段待办/);
});

test("the skill treats the card as a complete RP package rather than a required single character", () => {
  assert.match(skill, /complete RP package/);
  assert.match(skill, /`project\.yaml \+ src\/` is the project/);
  assert.match(skill, /card JSON\/PNG is a deployment container/);
  assert.match(
    skill,
    /host field is an adapter slot, not proof that its label owns the content/,
  );
  assert.match(
    skill,
    /top-level thing being designed is always the RP project\/package/,
  );
  assert.match(skill, /character is one optional content module/);
  assert.match(skill, /Never invent a "card character"/);
  assert.match(skill, /no fixed character at all/);
  assert.match(
    skill,
    /character stage remains a required inventory checkpoint/,
  );
  assert.match(skill, /may lock zero authored characters/);
  assert.equal(
    openaiConfig?.interface?.short_description,
    "分阶段共创并交付可验证的 SillyTavern 完整 RP 项目包",
  );
});

test("full AI delegation locks decisions without asking again", () => {
  assert.match(
    skill,
    /explicitly delegates a scope to AI, decide all remaining items in that scope/,
  );
  assert.match(
    skill,
    /report what was decided and why, lock it immediately, and never ask about it again unless the user reopens it/,
  );
  assert.match(delegation, /AI.*授权[\s\S]*报告[\s\S]*理由[\s\S]*锁定/);
});

test("MVU and EJS remain one optional stage with a direct skip path", () => {
  assert.match(skill, /MVU\/EJS \(optional\)/);
  assert.match(
    skill,
    /ask only whether to enter or skip it, not its internal design questions/,
  );
  assert.match(
    skill,
    /creates no disabled placeholders or pseudo-implementation/,
  );
  assert.match(skill, /proceeds to `narrative_opening`/);
});

test("UI stage asks for light, medium, or heavy without imposing fixed architecture", () => {
  assert.match(
    skill,
    /first question batch must ask which UI scale the project needs: `light`, `medium`, or `heavy`/,
  );
  assert.match(skill, /mention `basic_status` only as a compatibility route/i);
  assert.match(skill, /page counts, module counts, navigation counts[\s\S]*recommendations selected by project intent, never universal blockers/);
  assert.match(skill, /Large integrated pages, many tabs, technical views, remote libraries[\s\S]*are allowed/);
  assert.match(skill, /Missing real-host evidence never blocks design, implementation, building, or candidate delivery/);
  assert.match(statusUi, /进入本阶段后的第一批必须询问/);
  assert.match(statusUi, /轻型、中型还是重型/);
  assert.match(statusUi, /不是固定页数、模块数、导航结构、adapter 或代码量门槛/);
  assert.ok(statusUi.includes("父页面/宿主 DOM"));
  assert.ok(statusUi.includes("页面级常驻状态栏/面板没有被创建"));
});

test("UI guidance treats player experience as project-specific advice, not a universal blocker", () => {
  assert.match(skill, /Optimize for the user's desired experience, beauty, immersion, and functionality/);
  assert.match(skill, /Chinese localization, mobile widths, touch sizes, accessibility[\s\S]*recommendations/);
  assert.match(skill, /`innerHTML`, inline handlers, storage, network APIs, remote dependencies, dynamic code[\s\S]*are allowed/);
  assert.match(statusUi, /消息 UI 是面向玩家的 RP 伴随界面/);
  assert.match(statusUi, /5 个是常见参考，不是硬上限/);
  assert.match(statusUi, /禁止使用一个“通用对象递归器”/);
  assert.ok(statusUi.includes("&&[A-Za-z_$]"));
  assert.match(statusUi, /375px.*不是普遍硬门槛/);
  assert.match(statusUi, /技术 ID/);
});

test("personal-local trust and NSFW stay author-side without runtime gates", () => {
  assert.match(skill, /## Personal Local Operating Principle/);
  assert.match(skill, /private, local, non-commercial/);
  assert.match(skill, /Implement first, then report dependencies/);
  assert.match(skill, /author-side metadata only/);
  assert.match(skill, /enabled means write it directly; disabled means do not specialize it/);
  assert.match(skill, /neither state installs a runtime content gate/);
  assert.match(preflight, /不反向审查、删除、净化或阻断/);
  assert.ok(preflight.includes("不得向 CharacterBook、开场、系统提示、MVU/EJS、UI"));
});

test("MVU host acceptance and extension routes remain evidence-based", () => {
  assert.match(skill, /bundled MVU route natively implements `same_generation`/);
  assert.match(skill, /Other update modes are valid extension goals[\s\S]*registered custom adapter/);
  assert.match(skill, /Known SillyTavern replacement behavior remains a correctness constraint/);
  assert.match(mvuEjs, /Blob URL 渲染不是通用前置条件/);
  assert.match(mvuEjs, /仅当宿主观察到 MVU 未启动且该选项开启时/);
  assert.match(mvuEjs, /replace.*delta.*insert.*remove.*move/);
  assert.match(mvuEjs, /extra_pass.*both.*自定义 adapter/s);
  assert.match(mvuEjs, /hide_all/);
  assert.match(mvuEjs, /minDepth: 4/);
});
