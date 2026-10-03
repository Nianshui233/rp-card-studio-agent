import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// These are authoring-contract regressions, not browser or SillyTavern runtime tests.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const assets = read('shared/frontend/ui-assets.md');
const coverage = JSON.parse(read('internal-skills/rp-interview-orchestration/references/stage-coverage.json'));
const surfaces = [
  { name: 'opening_frontend', dir: 'st-opening-frontend-authoring', reference: 'opening-ui.md' },
  { name: 'message_frontend', dir: 'st-message-frontend-authoring', reference: 'message-ui.md' },
];

function contractBullet(label) {
  const line = assets.split(/\r?\n/).find(item => item.startsWith(`- **${label}**：`));
  assert(line, `missing SVG contract: ${label}`);
  return line;
}

test('both frontend skills treat SVG as an optional expression capability and load shared guidance', () => {
  for (const { dir, reference } of surfaces) {
    const skill = read(`internal-skills/${dir}/SKILL.md`);
    const ref = read(`internal-skills/${dir}/references/${reference}`);
    assert.match(skill, /SVG 是可选的一等表达能力/);
    assert.match(skill, /shared\/frontend\/ui-assets\.md.*选用图形化表达时读取/);
    assert.match(ref, /图形化/);
    assert.match(ref, /shared\/frontend\/ui-assets\.md/);
    assert.match(skill, /地图/);
    assert.match(skill, /徽章/);
    assert.match(skill, /仪表/);
    assert.match(skill, /纯文字项目不强问图形/);
    assert.match(skill, /每轮最多 3 个独立决策/);
  }
  assert.match(read('AGENT.md'), /SVG 是可选的一等图形表达能力/);
});

test('graphics interviews are conditional user-experience choices rather than SVG or runtime switches', () => {
  for (const { name } of surfaces) {
    const decisions = coverage.stages[name].decisions;
    const graphics = decisions.filter(item => item.id === 'graphical-expression');
    assert.equal(graphics.length, 1, `${name} must have one graphical-expression decision`);
    const item = graphics[0];
    assert.equal(item.policy, 'ask_or_explicitly_delegate');
    assert.match(item.trigger, /has not said/);
    assert.match(item.skip_when, /brief/);
    assert.match(item.skip_when, /text/);
    assert.match(item.skip_when, /delegation/);
    assert.match(item.player_language, /地图|路线图/);
    assert.match(item.player_language, /徽章|仪表/);
    assert.doesNotMatch(item.player_language, /点选|点击|发送|写入|保存/, 'graphical-expression must not bundle a separate host-action decision');
    assert.doesNotMatch(item.player_language, /SVG|viewBox|\bpath\b|CSS|API|DOM|Schema|MVU|EJS|iframe/);
    assert.equal(new Set(decisions.map(decision => decision.id)).size, decisions.length);
    assert(decisions.some(decision => decision.id === 'interaction-feel'), 'graphics must not replace the separate action decision');
  }
  const controller = read('internal-skills/rp-interview-orchestration/SKILL.md');
  assert.match(controller, /图形形式与点击动作分别确认/);
  assert.match(controller, /SVG 本身不自动启用 MVU、MVU_ZOD、EJS 或酒馆助手/);
  assert.match(assets, /静态徽章不要求这些运行能力/);
  assert.match(assets, /授权自由设计时，不重复提问/);
});

test('graphics distinguish functional icons, bespoke art, data views, and pure decoration', () => {
  for (const category of ['功能图标', '作品专属资产', '数据图形', '纯装饰图形']) {
    assert(assets.includes(`**${category}**`), `missing graphics category: ${category}`);
  }
  assert.match(assets, /空间、路线、徽章、仪表和关系表达/);
  assert.match(assets, /不要只把 emoji 换成统一描边图标/);
  assert.match(assets, /不要求每个前端都有 SVG/);
  assert.match(assets, /未使用 SVG 本身不构成错误/);
});

test('SVG rendering contracts distinguish real embedding modes, responsive sizing, and reference isolation', () => {
  const host = contractBullet('自包含与载体');
  assert.match(host, /默认内联 SVG/);
  assert.match(host, /不代表其字体、宿主插件或其他资源也已离线/);
  assert.match(host, /<img>.*CSS 背景.*不能把其中脚本或内部节点点击/s);
  assert.match(host, /纯 ST.*目标宿主证据/);
  const sizing = contractBullet('响应式');
  assert.match(sizing, /viewBox.*四个有限数值，宽高为正/);
  assert.match(sizing, /preserveAspectRatio/);
  assert.match(sizing, /不能只把整张图缩小到手机看不清/);
  const isolation = contractBullet('引用隔离');
  for (const token of ['<title>', '<desc>', 'clipPath', 'mask', 'marker', '<symbol>', 'url(#...)', 'href="#..."', 'ARIA']) {
    assert(isolation.includes(token), `missing SVG reference isolation: ${token}`);
  }
  assert.match(isolation, /iframe 之间是独立文档/);
  assert.match(isolation, /纯 ST 同文档多消息不能复用全局 ID/);
  assert.match(isolation, /禁止为了 SVG 再增加消息清理正则或组包含/);
});

test('decorative, informative, and interactive SVG have different accessibility contracts', () => {
  const accessibility = contractBullet('可访问语义');
  assert.match(accessibility, /纯装饰 SVG.*aria-hidden="true".*不占键盘焦点/);
  assert.match(accessibility, /信息型静态图.*role="img".*<title>.*aria-labelledby/);
  assert.match(accessibility, /复杂地图\/图表.*结构\/数值说明/);
  assert.match(accessibility, /交互容器不能一律套成整体 `role="img"`/);
  assert.match(accessibility, /原生按钮\/链接.*键盘激活/);
  assert.match(accessibility, /不能只靠颜色、形状或悬停/);
});

test('dynamic graphics preserve real data ownership and control isolation without banning authored code', () => {
  const data = contractBullet('真实数据');
  assert.match(data, /静态设定、实时状态和确定性派生视图分开/);
  assert.match(data, /唯一来源.*不创建影子状态/);
  assert.match(data, /没有主控时仍可画世界/);
  assert.match(data, /主控切换和 Swipe\/编辑后同步当前快照/);
  assert.match(data, /新增玩法\/持久字段回 owning stage 和 MVU 合同/);
  const input = contractBullet('动态输入边界');
  assert.match(input, /SVG、JavaScript、动画和交互属于正常维护源码/);
  assert.match(input, /textContent/);
  assert.match(input, /有限值\/范围校验/);
  assert.match(input, /createElementNS/);
  assert.match(input, /运行时图形载荷.*先解析并限制其元素、属性、URL 和执行能力/);
  const motion = contractBullet('动效与复杂度');
  assert.match(motion, /不设置行数\/节点数创作上限/);
  assert.match(motion, /prefers-reduced-motion.*卸载清理/);
});

test('graphics fallbacks are exceptional paths, not silent feature downgrades or fake state', () => {
  const fallback = contractBullet('异常回退');
  assert.match(fallback, /数据缺失时显示未知\/空态/);
  assert.match(fallback, /不把旧值或 mock 当当前数据/);
  assert.match(fallback, /回退是异常路径，不是静默降级/);
  assert.match(fallback, /先报告阻碍与替代路线，不擅自改成文字/);
  for (const { dir, reference } of surfaces) {
    assert.match(read(`internal-skills/${dir}/SKILL.md`), /静默.*文字|图形和交互.*静默降级/);
    assert.match(read(`internal-skills/${dir}/references/${reference}`), /回退是异常路径/);
  }
  assert.match(assets, /没有真实宿主测试时写 `runtime: not_run`/);
});

test('integration QA and npm test include the graphics contract rather than only asset mentions', () => {
  const qa = read('internal-skills/st-integration-qa/SKILL.md');
  assert.match(qa, /SVG\/图形化表达.*shared\/frontend\/ui-assets\.md/);
  assert.match(qa, /动态图形在无主控、主控切换、Swipe\/编辑和数据缺失/);
  assert.match(qa, /回退是异常路径.*不能冒充/);
  assert.match(read('scripts/check-examples.mjs'), /tests\/frontend-graphics-contract\.test\.mjs/);
});
