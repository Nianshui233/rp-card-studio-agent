// DSH 适配构建器：由仓库自身生成 DeepSeek Harness 可加载的 agent preset 清单。
//
//   node .dsh/build.mjs                                   # 生成到 .dsh/build/
//   node .dsh/build.mjs --out "$DSH_HOME/presets/rp-card-studio"
//   node .dsh/build.mjs --check                           # 只校验，不写盘
//
// 生成物（三件）：
//   <out>/package.json          承载 dsh.bundle.patch 的清单
//   <out>/cordis.patch.yml      preset 声明：persona(前言+AGENT.md) + 技能根 + 工具集
//   <out>/skills/rp-card-studio-workflow/SKILL.md
//                               入口技能：由 orchestrator/routing.yaml 现场生成阶段路由
//
// 设计约束：
//   - 仓库是唯一权威。persona 正文来自仓内 AGENT.md，路由表来自 orchestrator/routing.yaml，
//     适配层不重复维护这两份内容；routing.yaml 改了就重跑本脚本。
//   - 与其它 harness 无关。Codex / Claude Code 等只读 AGENT.md、agent.yaml、internal-skills/，
//     不会因为 .dsh/ 存在而受影响；本脚本也只写 --out 指定的目录。
//   - 不写死机器路径。清单里的路径在加载时由 dshHomePath() 解析，换机、换 $DSH_HOME 都不用改。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');

export const BUNDLE_NAME = '@local/dsh-rp-card-studio';
export const PRESET_ID = 'rp-card-studio';
export const PRESET_SLUG = 'rp-card-studio';
export const DEFAULT_OUT = path.join(HERE, 'build');
export const SKILL_DIR_NAME = 'rp-card-studio-workflow';

const PERSONA_INDENT = ' '.repeat(24);
const MACRO_ZWSP = '\u200B';

/** 从任意 dsh 安装/profile 处解析 YAML 解析器；找不到时返回 undefined 由调用方给出提示。 */
function loadYamlModule() {
  for (const anchor of dshAnchorCandidates()) {
    try {
      return createRequire(anchor)('yaml');
    } catch {
      // 试下一个锚点
    }
  }
  return undefined;
}

/**
 * dsh 安装在全局 npm 前缀下，不随 Node 可执行文件走，所以锚点按“确定能用的先后”排列：
 * 当前 profile、$DSH_HOME 下的 profile、全局 npm 前缀、最后才是 Node 自己的 node_modules。
 */
export function dshAnchorCandidates() {
  const anchors = [];
  const append = (value) => {
    if (typeof value === 'string' && value.trim() !== '') anchors.push(value);
  };
  append(process.env.DSH_PROFILE_DIR && path.join(process.env.DSH_PROFILE_DIR, 'package.json'));
  append(process.env.DSH_HOME && path.join(process.env.DSH_HOME, 'profiles', 'web', 'package.json'));
  append(process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'));
  append(path.join(path.dirname(process.execPath), 'node_modules', '@deepseek-ai', 'dsh', 'package.json'));
  return anchors;
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

/**
 * 规范化换行并剔除控制字符：生成物不随平台抖动，也不会因上游文件里的一枚制表符
 * 或零宽字符把 YAML 块标量结构弄坏（块标量的缩进必须是空格）。
 */
function normalizeEol(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function readUtf8(file) {
  let text = fs.readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return normalizeEol(text);
}

/** 按 YAML 块标量规则重新缩进：空行保持空行，不对空白行填充缩进。 */
export function indentBlock(text, indent) {
  return text
    .split('\n')
    .map((line) => (line.trim().length === 0 ? '' : indent + line))
    .join('\n');
}

export function toPosix(value) {
  return value.split(path.sep).join('/');
}

function yamlSingleQuote(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * SillyTavern 侧 `{{...}}` 宏必须逐字进入交付内容，但 prompt 渲染器遇到自己无法解析的
 * 完整 `{{name}}` 分组会报错。用零宽空格拆开花括号对：渲染后不可见，原文语义保留。
 * 返回值同时带出补丁清单与残留计数，供校验使用。
 */
export function escapeMacros(text) {
  const escaped = text.replaceAll('{{', `{${MACRO_ZWSP}{`).replaceAll('}}', `}${MACRO_ZWSP}}`);
  const patched = [...escaped.matchAll(/\{\u200B\{([^{}\u200B]*)\}\u200B\}/g)].map((match) => match[1]);
  const residual = [...escaped.matchAll(/\{\{/g)].length;
  return { text: escaped, patched, residual };
}

/** 生成 `!!js dshHomePath(...)` 形式，让清单在加载时而不是构建时解析路径。 */
export function dshHomePathExpression(...segments) {
  return `!!js dshHomePath(${segments.map(yamlSingleQuote).join(', ')})`;
}

/** 运行时前言：说明这是 DSH 会话、契约根目录在哪、先读哪些文件。正文仍全部来自 AGENT.md。 */
export function runtimePreamble() {
  return `# 运行环境（DeepSeek Harness）

你在 DeepSeek Harness 中运行，作为「SillyTavern 制卡工坊」Agent。以下约定只在本次会话生效，用于把本 Agent 的原始编排契约接到实际磁盘位置。

- 本 Agent 的**契约根目录（kit root）**是仓库目录 \`rp-card-studio-agent\` 的绝对路径。\`orchestrator/...\`、\`scripts/...\`、\`assets/...\`、\`shared/...\`、\`internal-skills/...\` 都相对该目录解析；执行仓库脚本前先把 shell 工作目录切到契约根目录。
- 会话技能 \`rp-card-studio-workflow\` 就是本工坊的**编排入口技能**，其中写明契约根目录绝对路径、\`orchestrator/routing.yaml\` 的当前阶段表、项目续接脚本与仓库校验脚本的调用方式。开始或继续工作时先加载它。
- 完整主契约就是本系统提示的余下部分（工坊 \`AGENT.md\` 全文）；需要原文或章节定位时，读契约根目录下的 \`AGENT.md\`。
- 用户当前会话的工作目录（cwd）是**作品工作目录**：作品内容写在那里，不要在契约根目录里创建作品文件。
- 本工坊的**阶段创作技能**（\`rp-*\` 与 \`st-*\`）已注册在会话技能目录里，按名字用技能加载工具加载；有用户创作决策时加载 \`rp-interview-orchestration\`，技术依赖按需加载对应 \`st-*\` 支援技能，不预读后续阶段或全部参考资料。
- 用户可见的说明、提问和交付报告使用简体中文；代码、宿主字段、路径与专有名词保留必要原文。
- 契约中出现的 \`{​{user}​}\`、\`{​{char}​}\`、\`{​{match}​}\`、\`{​{random::...}​}\`、\`{​{format_message_variable::stat_data}​}\` 等花括号写法是 **SillyTavern 侧宏**的原文，属于交付内容，必须逐字保留，不要当作 DSH 模板变量解释或改写。`;
}

/** 读取 orchestrator/routing.yaml，产出阶段表与技能清单（入口技能与校验共用同一份）。 */
export function readRouting(repoRoot = REPO_ROOT) {
  const yaml = loadYamlModule();
  if (yaml === undefined) {
    throw new Error(
      '找不到 YAML 解析器：请设置 DSH_PROFILE_DIR / DSH_HOME，或在已安装 dsh 的 Node 环境里运行。',
    );
  }
  const raw = readUtf8(path.join(repoRoot, 'orchestrator', 'routing.yaml'));
  // loader 的 `!!js` 标量标签：这里只做结构校验，值保持字符串。
  const doc = yaml.parseDocument(raw, { customTags: [{ tag: '!!js', resolve: (value) => value }] });
  if (doc.errors.length > 0) {
    throw new Error(`routing.yaml 解析失败：${doc.errors.map((error) => error.message).join('; ')}`);
  }
  const tree = doc.toJS();
  const stages = Object.entries(tree.stages ?? {}).map(([name, stage]) => ({
    name,
    primary: stage.primary_skill ?? null,
    supporting: stage.supporting_skills ?? [],
    optional: stage.optional === true,
    enableWhen: stage.enable_when ?? '',
    next: stage.next ?? null,
  }));
  return {
    schemaVersion: tree.schema_version ?? 'unknown',
    skillPaths: Object.keys(tree.skill_paths ?? {}),
    statePersistence: tree.state_persistence ?? 'unknown',
    stages,
  };
}

/** 入口技能正文：把 routing.yaml 的阶段表复述为可执行路由，并列出真实存在的校验脚本。 */
export function renderWorkflowSkill(routing, repoRoot = REPO_ROOT) {
  const rows = routing.stages
    .map((stage) => {
      const primary = stage.primary === null ? '（无）' : `\`${stage.primary}\``;
      const supporting = stage.supporting.length === 0
        ? '—'
        : stage.supporting.map((name) => `\`${name}\``).join('、');
      const condition = stage.optional ? (stage.enableWhen === '' ? '可选' : `仅当 \`${stage.enableWhen}\``) : '必经';
      const next = stage.next === null ? '—' : `\`${stage.next}\``;
      return `| \`${stage.name}\` | ${primary} | ${supporting} | ${condition} | ${next} |`;
    })
    .join('\n');
  const repoPosix = toPosix(repoRoot);
  const skillList = routing.skillPaths.map((name) => `\`${name}\``).join('、');

  return `---
name: ${SKILL_DIR_NAME}
description: "SillyTavern 制卡工坊的编排入口：阶段表、主/支援技能路由、阶段授权与交接账本、项目续接与进度画板、访谈控制器与真实运行验收。开始或继续一个 RP 角色卡项目、判断当前处于哪个阶段、或需要知道下一步该加载哪个创作技能时使用。"
---

# 制卡工坊编排入口

主契约在本会话的系统提示里（工坊 \`AGENT.md\` 全文；需要原文时读 \`${repoPosix}/AGENT.md\`）。本技能只负责把编排文件接到磁盘位置，并把 \`orchestrator/routing.yaml\`（schema ${routing.schemaVersion}）的当前阶段表复述成可执行路由。

## 契约根目录

\`\`\`text
${repoPosix}
\`\`\`

## 每次开始/继续先读

1. \`${repoPosix}/orchestrator/routing.yaml\` —— 阶段表、每阶段的主技能/支援技能、启用条件（状态持久化：\`${routing.statePersistence}\`）；
2. \`${repoPosix}/orchestrator/stage-loop.md\` —— 阶段内部循环与阶段总结要求；
3. \`${repoPosix}/orchestrator/interview-playbook.md\` —— 建议式深访规则；
4. \`${repoPosix}/orchestrator/stage-authorization.md\` —— 阶段授权、交接账本与防伪确认依据；
5. 项目目录的 \`制作文件/项目记录/authority.md\`、\`制作文件/项目记录/NEXT.md\`、\`制作文件/项目记录/materials.json\`、\`制作文件/项目记录/acceptance.json\`；项目尚未建立时先执行 \`continuation init\` 初始化最小续接文件。

## 阶段路由（由 routing.yaml 生成，共 ${routing.stages.length} 个阶段）

| 阶段 | 主技能 | 支援技能 | 启用条件 | 下一阶段 |
|---|---|---|---|---|
${rows}

规则：只加载当前阶段的主技能 + 上表声明的支援技能；有用户创作决策时加载 \`rp-interview-orchestration\`；不预读后续阶段。技能内部引用的 \`references/…\` 相对各自技能目录解析。

已注册的阶段技能（${routing.skillPaths.length} 个）：${skillList}。

## 项目续接、阶段授权与进度画板（\`rp-project-continuation\`）

长期项目在作品目录维护 \`制作文件/项目记录/\`：\`authority.md\`（阶段账本、授权依据、决定来源、当前范围）、\`NEXT.md\`（下一道门）、\`materials.json\`（材料来源、整理结果与研究状态）、\`acceptance.json\`（验收证据）。它属于项目状态，不进入最终 SillyTavern 导入包。

- 新项目默认执行只读宿主发现，续接复核当前环境，实机 QA 前刷新；安装/监听/可访问/账户扩展就绪分开，发现不是运行验收，不自动启动或导入；
- 叙事规则与开场可选且独立确定新增/沿用/不制作，未回答保持待定；与开场前端、消息前端不捆绑；
- 开始或继续时先展示**当前对话进度画板**（简体中文、短而具体）：项目/阶段/范围、已完成、进行中、待决定、暂缓、阻断/待实测、下一道门；
- 每轮产生真实内容、决定、测试结果或阻断变化后刷新画板，并同步更新 \`authority.md\` / \`NEXT.md\` / 相关证据；
- 制作进度、用户审阅、阶段执行许可和代定授权分开记录；用户确认必须有真实原话与定位，文件存在、自动测试或 Agent 自己的账本都不能当作用户确认；
- 创作成果提交后待审阅、授权到期，不自行跨下一创作阶段；本次范围 QA 与交付按 \`orchestrator/automatic-work.md\` 默认执行，不另报备、不伪造用户接受；
- 用户说“继续/续接”时按顺序：读 \`制作文件/项目记录/\` → 读实际源文件/制作文件/配置/制品与 Git 状态 → 核对权威与实现是否一致 → 展示画板 → 只问真正开放或冲突的决定 → 完成后更新文件与画板；
- 权威与实际实现冲突时，暂停提升状态、记录冲突、请用户确认权威来源；不把聊天摘要、旧报告或文件名当成当前权威。

## 原始资料整理与主动外部研究（\`rp-materials-research\`）

材料阶段（\`materials\`）负责两件独立能力，两者可以同时发生：

- **原始资料整理**：只要用户提供了任何资料（粘贴文本、本地文件、旧卡、世界书、脚本、网页摘录、图片参考），就必须整理进 \`制作文件/项目记录/materials.json\`；资料大小只改变分段/批次策略，不是开关；
- **主动外部研究**：项目依赖外部作品、现实事实、版本敏感信息或改编线时默认启用，不要求用户额外说“可以搜索”；本预设已挂载 \`web_search\` / \`web_fetch\`，可直接使用；默认网络政策是 \`public_sources_only\`；
- 用户明确要求“不联网/只用我给的材料”时记录 \`research.status: skipped\` + \`override: user\`；宿主确实没有搜索能力时记录 \`research.status: blocked\` 并写明缺失能力，**不得声称已搜索或已核验**；
- 搜索结果只是候选线索：区分官方/原作来源与 Wiki、社区解析、同人资料，区分 canon/reference/fanon/unknown，不混改编线，只保留必要短摘录；
- 材料阶段结束向定位/世界/角色阶段交付短简报（材料与来源范围、已确认核心事实、制卡候选、冲突与未知、待用户决定项、研究状态、下游如何消费）。

## 仓库校验脚本（相对契约根目录执行）

| 脚本 | 用途 |
|---|---|
| \`node scripts/continuation/continuation.mjs init --root <项目根> --project-id <id> --title <标题>\` | 初始化 \`制作文件/项目记录/\` 最小续接文件与阶段账本 |
| \`node scripts/continuation/continuation.mjs validate --root <项目根>\` | 校验 authority/NEXT/账本：front matter、必需区块、project_id 一致性、跨阶段授权与伪关闭 |
| \`node scripts/continuation/continuation.mjs board --root <项目根>\` | 由 authority + NEXT 渲染当前进度画板 |
| \`node scripts/materials/validate-materials.mjs <项目根>/制作文件/项目记录/materials.json\` | 校验 \`rp-card-studio/materials/v2\` 合同：processing/research 状态、来源、事实、研究问题、冲突与整理结果 |
| \`node scripts/validate-rolecard-package.mjs\` | 角色卡包级检查；MVU 项目必须传 \`--mvu-mode\`、\`--mvu-init-strategy\`，MVU_ZOD 另传 \`--mvu-contract "制作文件/配置/MVU运行合同.yaml"\` 与 \`--zod-source\` |
| \`node scripts/mvu/validate-mvu-package.mjs\` | MVU 包级检查 |
| \`node scripts/ejs/validate-ejs-package.mjs\` | EJS 包级检查 |
| \`node scripts/regex/validate-tavern-regex.mjs\` | 正则 JSON 结构校验 |
| \`node scripts/regex/run-regex-fixtures.mjs\` | 回放确定性正则 fixtures |
| \`node scripts/regex/trace-render-pipeline.mjs\` | 追踪 display/prompt 渲染管线 |
| \`node scripts/worldbook/split-yaml-lossless.mjs\` | canonical YAML 无损切片成世界书 |
| \`python -X utf8 scripts/mvu/validate-initvar-yaml.py\` | \`[initvar]\` YAML 结构校验 |
| \`node scripts/check-examples.mjs\` | 仓库自带示例的静态合同核对（\`npm test\` 即此） |

## DSH 适配层自身（\`.dsh/\`）

- \`node .dsh/build.mjs [--out <目录>] [--check]\` —— 重新生成本预设清单与入口技能；换了仓库路径或改了 \`routing.yaml\` 后必须重跑；
- \`node .dsh/install.mjs [--profile <名>] [--out <目录>] [--dry-run]\` —— 生成并把本 bundle 注册进指定 profile，可重复执行；
- \`node .dsh/verify.mjs [--profile <名>]\` —— 校验生成物并尝试用 \`dsh --dump-config\` 做真实加载检查（dsh 不在 PATH 时按未验证报告）；
- 适配层只服务 DSH：Codex、Claude Code 等其它 harness 继续读 \`AGENT.md\`、\`agent.yaml\` 与 \`internal-skills/\`，不受 \`.dsh/\` 影响。

## 模板与共享资料

- \`assets/templates/continuation/\`：\`authority.md\`、\`NEXT.md\`、\`materials.json\`、\`acceptance.json\`、\`progress-board.md\` 续接模板；
- \`assets/templates/\`：世界/角色/系统/场景/开场/用户角色模板，MVU 运行合同、更新规则、变量路径索引、\`mvu-zod.schema.js\`、NSFW mixin、定量系统 mixin；
- \`shared/frontend/ui-assets.md\`：字形、图标、SVG 图形与资源策略；
- \`shared/frontend/layout-preview.md\`：给制作者主动画当前布局和交互状态；有真实 HTML 时展示当前渲染图，不拿草图冒充完成或新增预览审批门；
- \`assets/examples/\`：经过静态合同核对的原创示例，只在需要对照实现时读取。

## 交付与验收口径

没有真实 SillyTavern 宿主证据时记录 \`runtime: not_run\`，不得把静态检查说成实机通过；最终报告按主契约要求简短列出项目包绝对路径、实际组件与导入顺序、正则/HTML 配对、通过的检查、\`not_run\` 项、宿主依赖与已知限制。
`;
}

/** 汇总一次生成所需的全部内容；写盘与校验共用，避免两边漂移。 */
export function renderPreset({ repoRoot = REPO_ROOT, dshVersion = process.env.DSH_VERSION ?? 'unknown' } = {}) {
  const template = readUtf8(path.join(repoRoot, '.dsh', 'preset.template.yml'));
  const agent = readUtf8(path.join(repoRoot, 'AGENT.md')).replace(/\n+$/, '');
  const routing = readRouting(repoRoot);
  const persona = `${runtimePreamble()}\n\n---\n\n${agent}`;
  // 先把正文按块标量缩进（24 空格，比 `prefix:` 键深一级）填进模板，再对整份清单做宏
  // 转义：零宽空格只落在 persona 正文里，模板自身的标点与注释保持原样。
  const withPersona = template.replaceAll('__PERSONA__', indentBlock(persona, PERSONA_INDENT));
  const { text: patch, patched, residual } = escapeMacros(withPersona);
  const workflowSkill = renderWorkflowSkill(routing, repoRoot);
  const pkg = {
    name: BUNDLE_NAME,
    version: '1.0.0',
    private: true,
    type: 'module',
    description: 'SillyTavern 制卡工坊的 DeepSeek Harness 适配清单（生成物，适配层源码在仓库 .dsh/）',
    generated: {
      by: '.dsh/build.mjs',
      repoRoot,
      dshVersion,
      generatedAt: new Date().toISOString(),
    },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  };
  return { patch, pkg, workflowSkill, persona, patched, residual, routing };
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

/** 生成物声明它是在哪个 dsh 版本上构建的；探测不到就如实写 unknown。 */
function dshVersionForReport() {
  for (const anchor of dshAnchorCandidates()) {
    try {
      const pkg = JSON.parse(readUtf8(anchor));
      if (pkg.name === '@deepseek-ai/dsh') return pkg.version;
    } catch {
      // 下一个锚点
    }
  }
  return 'unknown';
}

function main() {
  const checkOnly = hasFlag('--check');
  const out = path.resolve(option('--out') ?? DEFAULT_OUT);
  const rendered = renderPreset({ dshVersion: dshVersionForReport() });

  const files = [
    [path.join(out, 'package.json'), `${JSON.stringify(rendered.pkg, null, 2)}\n`],
    [path.join(out, 'cordis.patch.yml'), rendered.patch],
    [path.join(out, 'skills', SKILL_DIR_NAME, 'SKILL.md'), rendered.workflowSkill],
  ];
  if (!checkOnly) for (const [file, content] of files) writeFile(file, content);

  const yaml = loadYamlModule();
  const parsed = yaml.parseDocument(rendered.patch, { customTags: [{ tag: '!!js', resolve: (value) => value }] });
  const yamlErrors = parsed.errors.map((error) => String(error.message).split('\n')[0]);
  const presetRow = yamlErrors.length > 0 ? undefined : parsed.toJS()?.[0]?.insert?.[0];
  const plugins = presetRow?.config?.plugins ?? [];
  const report = {
    repoRoot: REPO_ROOT,
    out,
    wrote: checkOnly ? 'none (--check)' : files.map(([file]) => file),
    yamlErrors,
    presetId: presetRow?.config?.id ?? null,
    presetSlug: PRESET_SLUG,
    pluginRows: plugins.length,
    childRows: plugins.reduce((total, row) => total + (Array.isArray(row.config) ? row.config.length : 0), 0),
    stages: rendered.routing.stages.length,
    skills: rendered.routing.skillPaths.length,
    routingSchema: rendered.routing.schemaVersion,
    personaBytes: Buffer.byteLength(rendered.persona, 'utf8'),
    agentBytes: Buffer.byteLength(readUtf8(path.join(REPO_ROOT, 'AGENT.md')), 'utf8'),
    personaFitsInContext: Buffer.byteLength(rendered.persona, 'utf8') < 65536,
    patchedMacros: rendered.patched,
    residualDoubleBrace: rendered.residual,
    // 生成物里只允许出现 dshHomePath(...) 相对片段；任何用户主目录绝对路径都是移植性缺陷。
    absolutizedPaths: [
      ...new Set(
        (rendered.patch.match(/[A-Za-z]:[\\/]{1,2}Users[\\/][^'"\s]*|[A-Za-z]:[\\/]{1,2}[^'"\s]*/g) ?? []).map(
          (hit) => hit.slice(0, 40),
        ),
      ),
    ],
    writeTargets: files.map(([file]) => file),
    overwroteExisting: files
      .filter(([file]) => fs.existsSync(file) && !checkOnly)
      .map(([file]) => file),
  };
  report.personaBytesHuman = formatBytes(report.personaBytes);
  report.agentBytesHuman = formatBytes(report.agentBytes);
  const reportFile = option('--report');
  if (reportFile !== undefined) writeFile(path.resolve(reportFile), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (report.yamlErrors.length > 0 || report.residualDoubleBrace !== 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
