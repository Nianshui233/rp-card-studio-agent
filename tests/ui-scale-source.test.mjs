import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateRuntimeSources } from "../scripts/rp-card-runtime.mjs";

function evidence() {
  return {
    baseline: {
      navigation: ["内部导航"], data_views: ["多类数据"], information_tools: ["搜索和详情"],
      host_actions: ["宿主动作"], feedback_states: ["加载和失败"], responsive_checks: ["窄屏"],
      theme_features: ["项目主题"], data_binding: ["当前楼层状态"],
    },
    level_advancements: {
      usability: ["复合流程"], information_architecture: ["多功能区"], interaction_depth: ["详情和编辑"],
      visual_expression: ["主题演出"], host_integration: ["宿主联动"], persistence_lifecycle: ["重载与Swipe"],
    },
    primary_play_surface: false,
  };
}

function baseSources(root, { statusFile, openingFile } = {}) {
  return {
    assembly: [{ value: {
      worldbook_manifest: { entries: [] },
      media_manifest: { enabled: false, assets: [] },
      runtime_manifest: { mode: "authored", regex_scripts: [], tavern_helper_scripts: [], extension_fields: {} },
    } }],
    ui: statusFile ? [{ value: {
      status: "locked",
      status_ui: {
        enabled: true, authoring_mode: "direct_html", experience_level: "medium", theme_direction: "测试",
        device_priority: "equal", data_sources: [], host_interactions: [], opening_relationship: "separate",
        experience_evidence: evidence(), lifecycle_checks: [], runtime: "not_run",
        surfaces: [{ id: "status", name: "状态", marker: "<状态/>", file: statusFile, render_route: "inline_html", render_ref: null, render_evidence: [], emission: null }],
      },
      source_refs: [],
    } }] : [],
    prompts: openingFile ? [{ value: {
      status: "locked",
      opening_ui: {
        enabled: true, marker: "<开场/>", file: openingFile, render_route: "inline_html", render_ref: null,
        render_evidence: [], opening_id: "default", experience_level: "heavy", theme_direction: "测试",
        device_priority: "equal", journey: "介绍→路线→创角→预览→确认", fallback: "文本回退", runtime: "not_run",
      },
      openings: [{ id: "default", is_default: true, visible_text: "<开场/>", prompt_visible_text: "模型可见回退" }],
    } }] : [],
    mvu: [], world: [], characters: [], systems: [], scenes: [], positioning: [],
  };
}

test("declared medium/heavy UI cannot be backed by micro HTML", async () => {
  const root = await mkdtemp(join(tmpdir(), "rp-ui-scale-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "status.html"), "<!doctype html><html><body><p>状态</p></body></html>");
  await writeFile(join(root, "src", "opening.html"), "<!doctype html><html><body><button>开始</button></body></html>");
  const result = await validateRuntimeSources({
    project: { features: { status_ui: true }, deliverables: ["rp_project_package"] },
    sources: baseSources(root, { statusFile: "src/status.html", openingFile: "src/opening.html" }),
    projectRoot: root,
  });
  assert.ok(result.issues.filter((candidate) => candidate.rule === "ui.scale_floor").length >= 2);
});

test("MVU-backed message HTML must bridge iframe and parent host scopes", async () => {
  const root = await mkdtemp(join(tmpdir(), "rp-ui-scope-"));
  await mkdir(join(root, "src"), { recursive: true });
  const common = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>@media(max-width:600px){body{font-size:14px}}</style></head><body><nav data-tab="a">甲</nav><nav data-tab="b">乙</nav><nav data-tab="c">丙</nav><main><section id="panel-a"><input placeholder="搜索详情"><button onclick="act()">行动</button><button onclick="retry()">重试</button><div class="loading empty error success">状态</div></section><section id="panel-b">数据</section><section id="panel-c">事件</section><section id="panel-d">日志</section></main><script>function act(){window.parent.document;} function retry(){} const state=window.Mvu.getMvuData({type:'message',message_id:0}).stat_data; addEventListener('click',()=>{});</script></body></html>`;
  await writeFile(join(root, "src", "status.html"), common);
  const result = await validateRuntimeSources({
    project: { features: { status_ui: true }, deliverables: ["rp_project_package"] },
    sources: baseSources(root, { statusFile: "src/status.html" }),
    projectRoot: root,
  });
  assert.ok(result.issues.some((candidate) => candidate.rule === "ui.host_scope"));

  await writeFile(join(root, "src", "status.html"), common.replace("const state=window.Mvu", "const mvu=window.Mvu||window.parent?.Mvu; const state=mvu"));
  const repaired = await validateRuntimeSources({
    project: { features: { status_ui: true }, deliverables: ["rp_project_package"] },
    sources: baseSources(root, { statusFile: "src/status.html" }),
    projectRoot: root,
  });
  assert.ok(!repaired.issues.some((candidate) => candidate.rule === "ui.host_scope"));
});
