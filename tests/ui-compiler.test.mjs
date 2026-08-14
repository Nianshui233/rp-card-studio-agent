import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import {
  applySillyTavernRegexAdapter,
  validateRuntimeSources,
} from "../scripts/rp-card-runtime.mjs";
import {
  compileUiExperienceRegexes,
  stableUiRegexId,
  validateUiExperienceSources,
} from "../scripts/ui/compiler.mjs";

function component(
  id,
  preset,
  marker,
  producer = "opening",
  mode = "none",
  payload = "none",
  bindings = [],
) {
  return {
    relativePath: `src/ui/components/${id}.yaml`,
    value: {
      schema_version: "2.0.0",
      status: "locked",
      ui_component: {
        id,
        display_name: id.replaceAll("_", " "),
        role:
          preset === "status_terminal"
            ? "dashboard"
            : producer === "model"
              ? "narrative_component"
              : "entry",
        preset,
        trigger: {
          kind: producer === "model" ? "block" : "self_closing",
          marker,
          producer,
        },
        data_contract: { mode, payload_format: payload },
        binding_refs: bindings,
        interactions:
          preset === "choice_panel"
            ? [
                "local_interaction",
                "message_read",
                "message_write",
                "slash_command",
              ]
            : ["local_interaction"],
        content: {
          eyebrow: "PROJECT // UI",
          title: id,
          subtitle: "A project-specific message surface.",
          body: ["Purpose-built content."],
          primary_action: null,
          secondary_action: null,
        },
        layout: {
          kind: preset === "status_terminal" ? "tabs" : "hero",
          groups:
            preset === "status_terminal"
              ? [
                  {
                    id: "main",
                    label: "总览",
                    binding_refs: bindings,
                    collapsed: false,
                  },
                ]
              : [],
        },
        states: {
          loading: "读取中",
          empty: "暂无内容",
          error: "读取失败",
          degraded: "界面不可用",
        },
        source: { mode: "generated", html: "", css: "", js: "" },
        delivery: {
          surface: "message",
          adapter: "tavern_helper_message",
          level: "host_required",
          run_on_edit: true,
          min_depth: null,
          max_depth: 5,
        },
        acceptance: { runtime: "not_run", fallback: "保留普通文本。" },
      },
    },
  };
}

function sources(level = "light", componentCount = 6) {
  const ids = [
    "launch",
    "intro",
    "status",
    "update",
    "roll",
    "choice",
    ...Array.from({ length: 20 }, (_, index) => `extra_${index}`),
  ].slice(0, componentCount);
  const presets = {
    launch: "launch_screen",
    intro: "introduction_page",
    status: "status_terminal",
    update: "update_report",
    roll: "roll_result",
    choice: "choice_panel",
  };
  const components = ids.map((id) =>
    component(
      id,
      presets[id] ?? "custom_panel",
      id === "status" ? "StatusPlaceHolderImpl" : `RPUI_${id}`,
      ["update", "roll", "choice"].includes(id) ? "model" : "opening",
      id === "status"
        ? "stat_data"
        : ["update", "roll", "choice"].includes(id)
          ? "current_message"
          : "none",
      ["update", "roll"].includes(id)
        ? "text"
        : id === "choice"
          ? "lines"
          : "none",
      id === "status" ? ["health"] : [],
    ),
  );
  return {
    positioning: [],
    world: [],
    characters: [],
    systems: [],
    scenes: [],
    prompts: [],
    assembly: [],
    mvu: [
      {
        relativePath: "src/mvu/runtime.yaml",
        value: {
          mvu: {
            enabled: true,
            storage: { namespace: "stat_data" },
            variables: [
              {
                source_path: "character.health",
                runtime_path: "stat_data.character.health",
                type: "integer",
                default: 100,
                constraints: { minimum: 0, maximum: 100 },
                writer: { id: "state", operations: ["set"] },
                readers: ["status_ui"],
                visibility: "player",
              },
            ],
            initialization: { defaults: { character: { health: 100 } } },
            update_rules: [],
            routing: { entries: [] },
          },
          ejs: { enabled: false, entries: [] },
          runtime_contract: { dependencies: [] },
        },
      },
    ],
    ui: [
      {
        relativePath: "src/ui/ui.yaml",
        value: {
          schema_version: "2.0.0",
          status: "locked",
          ui_experience: {
            enabled: true,
            experience_level: level,
            goals: ["world_immersion"],
            device_priority: "equal",
            theme_ref: "ui_theme:main",
            bindings_ref: "ui_bindings:main",
            surfaces: ids.map((id) => `ui_component:${id}`),
            navigation: {
              kind: "mixed",
              primary_surface: `ui_component:${ids[0]}`,
              routes: [],
            },
            host_policy: {
              adapter: "tavern_helper_message",
              allow_remote_resources: false,
              allowed_interactions: [
                "static",
                "local_interaction",
                "message_read",
                "message_write",
                "slash_command",
              ],
            },
            accessibility: {
              keyboard: true,
              color_independent: true,
              reduced_motion: true,
              live_updates: "polite",
            },
            performance: {
              max_component_bytes: 100000,
              max_total_bytes: 2000000,
              large_collection_strategy: "collapse",
            },
            acceptance: {
              desktop: "required",
              narrow: "required",
              message_edit: "required",
              empty_state: "required",
              error_state: "required",
              runtime: "not_run",
            },
          },
        },
      },
      {
        relativePath: "src/ui/theme.yaml",
        value: {
          schema_version: "2.0.0",
          status: "locked",
          ui_theme: {
            id: "main",
            display_name: "潮湿档案灯箱",
            concept:
              "项目专属的潮湿档案纸与检视灯箱视觉，不使用通用霓虹终端模板。",
            palette: {
              background: "#101416",
              surface: "#182025",
              surface_alt: "#202B31",
              primary: "#D8B25C",
              secondary: "#67A6A0",
              text: "#F3EFE4",
              muted: "#A9A69E",
              success: "#6EBF8B",
              warning: "#E0A44C",
              danger: "#D45B55",
              border: "#4C565A",
            },
            typography: {
              display: "STKaiti",
              body: "system-ui",
              utility: "monospace",
              scale: [0.75, 0.875, 1, 1.25],
            },
            shape: {
              radius: "small",
              border_width: "hairline",
              shadow: "soft",
            },
            texture: "paper",
            signature: {
              kind: "seal",
              description: "关键线索使用朱印批注作为唯一视觉签名。",
            },
            motion: "restrained",
            breakpoints: { narrow: 520, wide: 1100 },
            resources: {
              font_strategy: "system",
              icon_strategy: "inline_svg",
              remote_urls: [],
            },
          },
        },
      },
      {
        relativePath: "src/ui/bindings.yaml",
        value: {
          schema_version: "2.0.0",
          status: "locked",
          ui_bindings: {
            id: "main",
            bindings: [
              {
                id: "health",
                component_ref: "ui_component:status",
                slot: "health",
                source_path: "character.health",
                presentation: "progress",
                label: "生命",
                missing_value: "未知",
                priority: 0,
                range: { minimum: 0, maximum: 100, reverse: false },
                tones: [{ operator: "lte", value: 20, tone: "danger" }],
                collection: { empty: "无", limit: 20, sort: "source" },
              },
            ],
          },
        },
      },
      ...components,
    ],
  };
}

function regexFromHostLiteral(literal) {
  const match = /^\/(.*)\/([a-z]*)$/s.exec(literal);
  assert.ok(match, `Invalid SillyTavern regex literal: ${literal}`);
  return new RegExp(match[1], match[2]);
}

class FakeNode {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.hidden = false;
    this.style = {};
    this.textContent = "";
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  addEventListener() {}

  setAttribute(name, value) {
    this[name] = value;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

function nodeText(node) {
  return [node.textContent, ...node.children.map(nodeText)].join(" ");
}

async function runCompiledUi(replacement, { variables, capturedPayload = null }) {
  const scriptMatch = /<script>([\s\S]*)<\/script>/.exec(replacement);
  assert.ok(scriptMatch, "Compiled UI must contain an executable script");
  const root = new FakeNode();
  const state = new FakeNode();
  const bindingHosts = new Map();
  const messageHost = new FakeNode();
  const captured = new FakeNode();
  captured.textContent = capturedPayload ?? "";
  root.querySelector = (selector) => {
    if (selector === "[data-rp-state]") return state;
    if (selector === "[data-rp-message]") return messageHost;
    const binding = /^\[data-rp-binding="(.+)"\]$/.exec(selector);
    if (binding) {
      if (!bindingHosts.has(binding[1])) bindingHosts.set(binding[1], new FakeNode());
      return bindingHosts.get(binding[1]);
    }
    return null;
  };
  const context = {
    console,
    document: {
      querySelector(selector) {
        if (selector.startsWith("[data-rp-ui-root=")) return root;
        if (selector === "[data-rp-captured-payload]") return capturedPayload === null ? null : captured;
        return null;
      },
      createElement() {
        return new FakeNode();
      },
    },
    getAllVariables: () => structuredClone(variables),
    getVariables: () => structuredClone(variables),
    getCurrentMessageId: () => 2,
    getChatMessages: () => [],
    waitGlobalInitialized: async () => {},
    eventOn: () => {},
    eventRemoveListener: () => {},
    Mvu: { events: { VARIABLE_UPDATE_ENDED: "variable-update-ended" } },
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  context.addEventListener = () => {};
  vm.runInNewContext(scriptMatch[1], context);
  await new Promise((resolve) => setImmediate(resolve));
  return { root, state, bindingHosts, messageHost };
}

test("UI compiler emits stable Chinese-named component regexes with self-contained message frontends", () => {
  const result = compileUiExperienceRegexes({
    project: { features: { status_ui: true } },
    sources: sources(),
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.scripts.length, 6);
  assert.equal(result.usesStatusPlaceholder, true);
  assert.equal(result.scripts[0].id, stableUiRegexId("launch"));
  assert.ok(
    result.scripts.every((script) => script.scriptName.startsWith("[界面]")),
  );
  assert.ok(result.scripts.every((script) => script.runOnEdit === true));
  const status = result.scripts.find(
    (script) => script.rp_card_studio.source_id === "status",
  );
  assert.match(
    status.replaceString,
    /^```\n<body[\s\S]*<style>[\s\S]*<script>[\s\S]*<\/body>\n```$/,
  );
  assert.match(status.replaceString, /getCurrentMessageId/);
  assert.match(status.replaceString, /getVariables/);
  assert.match(
    status.replaceString,
    /binding\.read_paths/,
  );
  assert.match(status.replaceString, /eventRemoveListener/);
  assert.match(status.replaceString, /ownerKey/);
  assert.match(status.replaceString, /\.onclick=/);
  assert.match(status.replaceString, /min-height:44px/);
  assert.match(status.replaceString, /align-items:start/);
  assert.doesNotMatch(status.replaceString, /pagehide/);
  assert.doesNotMatch(status.replaceString, /\\\$&|\$(?:[&`']|\d{1,2})/);
  assert.equal((status.replaceString.match(/wireLocal\(\)/g) ?? []).length, 1);
  assert.equal(
    (status.replaceString.match(/wirePrimary\(\)/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(status.replaceString, /https?:\/\//i);
});

test("model block components carry their captured payload into the replacement iframe", async () => {
  const result = compileUiExperienceRegexes({
    project: { features: { status_ui: true } },
    sources: sources(),
  });
  const update = result.scripts.find(
    (script) => script.rp_card_studio.source_id === "update",
  );
  const input = '<RPUI_update>{"title":"开局锚定","location":"苏州府吴县"}</RPUI_update>';
  const replacement = input.replace(
    regexFromHostLiteral(update.findRegex),
    update.replaceString,
  );
  assert.match(update.findRegex, /\(\[\\s\\S\]\*\?\)/);
  assert.match(update.replaceString, /data-rp-captured-payload/);
  assert.doesNotMatch(update.replaceString, /getChatMessages/);
  const rendered = await runCompiledUi(replacement, {
    variables: {},
    capturedPayload: '{"title":"开局锚定","location":"苏州府吴县"}',
  });
  assert.match(nodeText(rendered.messageHost), /开局锚定/);
  assert.match(nodeText(rendered.messageHost), /苏州府吴县/);
});

test("status components wait for MVU and prefer the updated source path over a stale runtime alias", async () => {
  const divergent = sources();
  const declaration = divergent.mvu[0].value.mvu.variables[0];
  declaration.source_path = "historical_sandbox_state.current_date";
  declaration.runtime_path = "stat_data.world.current_date";
  const bindingSet = divergent.ui.find((entry) => entry.value.ui_bindings);
  bindingSet.value.ui_bindings.bindings[0].id = "current_date";
  bindingSet.value.ui_bindings.bindings[0].source_path = declaration.source_path;
  bindingSet.value.ui_bindings.bindings[0].label = "当前纪年";
  const statusComponent = divergent.ui.find(
    (entry) => entry.value.ui_component?.id === "status",
  );
  statusComponent.value.ui_component.binding_refs = ["current_date"];
  statusComponent.value.ui_component.layout.groups[0].binding_refs = ["current_date"];

  const result = compileUiExperienceRegexes({
    project: { features: { status_ui: true } },
    sources: divergent,
  });
  const status = result.scripts.find(
    (script) => script.rp_card_studio.source_id === "status",
  );
  assert.match(status.replaceString, /waitGlobalInitialized/);
  assert.match(status.replaceString, /getAllVariables/);
  const rendered = await runCompiledUi(status.replaceString, {
    variables: {
      stat_data: {
        historical_sandbox_state: { current_date: "洪武十四年" },
        world: { current_date: "uninitialized" },
      },
    },
  });
  assert.match(nodeText(rendered.bindingHosts.get("current_date")), /洪武十四年/);
  assert.doesNotMatch(
    nodeText(rendered.bindingHosts.get("current_date")),
    /uninitialized/,
  );
});

test("message components generate CharacterBook output contracts and survive idempotent rebuilds", () => {
  const input = {
    data: {
      name: "UI test",
      first_mes: "Opening",
      alternate_greetings: [],
      extensions: {},
      character_book: { entries: [] },
    },
  };
  const options = {
    project: { features: { status_ui: true, mvu: true } },
    sources: sources(),
    target: "character",
  };
  const first = applySillyTavernRegexAdapter(input, options);
  const second = applySillyTavernRegexAdapter(first.payload, options);
  assert.deepEqual(first.issues, []);
  assert.deepEqual(second.issues, []);
  assert.deepEqual(second.payload, first.payload);
  const contracts = first.payload.data.character_book.entries.filter(
    (entry) =>
      entry.extensions?.rp_card_studio?.kind === "ui_component_contract",
  );
  assert.deepEqual(contracts.map((entry) => entry.comment).sort(), [
    "界面协议：choice",
    "界面协议：roll",
    "界面协议：update",
  ]);
  assert.ok(
    contracts.every((entry) =>
      entry.content.includes("叙事正文之后、变量更新块之前"),
    ),
  );
});

test("UI validation allows parent-page host bridging without turning level guidance into blockers", async () => {
  const bridged = sources("medium", 6);
  const bridgedComponent = bridged.ui.find((entry) => entry.value.ui_component);
  bridgedComponent.value.ui_component.interactions.push("host_bridge");
  bridgedComponent.value.ui_component.source = {
    mode: "inline",
    html: "",
    css: "",
    js: 'const input=window.parent.document.querySelector("#send_textarea"); if(input) input.focus();',
  };
  const result = await validateRuntimeSources({
    project: {
      project: { target: "character_card" },
      features: { status_ui: true, mvu: true, ejs: false },
      deliverables: ["character_card_json"],
    },
    sources: bridged,
    projectRoot: process.cwd(),
  });
  assert.equal(result.issues.some((item) => item.rule === "ui.capability_floor"), false);
  assert.ok(result.warnings.some((item) => item.rule === "ui.capability_floor"));
  assert.equal(
    result.issues.some(
      (item) => item.rule === "ui.user_constraint.persistent_status_panel",
    ),
    false,
  );
});

test("UI validation still rejects known persistent page-level status panels", async () => {
  const persistent = sources("light", 6);
  const component = persistent.ui.find((entry) => entry.value.ui_component);
  component.value.ui_component.interactions.push("host_bridge");
  component.value.ui_component.source = {
    mode: "inline",
    html: "",
    css: "",
    js: 'window.parent.document.querySelector("#sheld")?.append(document.createElement("div"));',
  };
  const result = await validateRuntimeSources({
    project: {
      project: { target: "character_card" },
      features: { status_ui: true, mvu: true, ejs: false },
      deliverables: ["character_card_json"],
    },
    sources: persistent,
    projectRoot: process.cwd(),
  });
  assert.ok(
    result.issues.some(
      (item) => item.rule === "ui.user_constraint.persistent_status_panel",
    ),
  );
});

test("UI validation rejects SillyTavern replacement tokens in inline sources", async () => {
  const unsafe = sources("light", 6);
  const unsafeComponent = unsafe.ui.find((entry) => entry.value.ui_component);
  unsafeComponent.value.ui_component.source = {
    mode: "inline",
    html: "<p>$&</p>",
    css: "",
    js: "",
  };
  const result = await validateRuntimeSources({
    project: {
      project: { target: "character_card" },
      features: { status_ui: true, mvu: true, ejs: false },
      deliverables: ["character_card_json"],
    },
    sources: unsafe,
    projectRoot: process.cwd(),
  });
  assert.ok(
    result.issues.some((item) => item.rule === "ui.correctness.replacement_token"),
  );
});

test("inline message scripts reject HTML-entity-prone operators but allow pagehide cleanup", async () => {
  const unsafe = sources("light", 6);
  const unsafeComponent = unsafe.ui.find((entry) => entry.value.ui_component);
  unsafeComponent.value.ui_component.source = {
    mode: "inline",
    html: "",
    css: "",
    js: "const current={cleanup(){}}; if(current&&current.cleanup){current.cleanup()} const controller=new AbortController(); addEventListener('pagehide',()=>controller.abort());",
  };
  const result = await validateRuntimeSources({
    project: {
      project: { target: "character_card" },
      features: { status_ui: true, mvu: true, ejs: false },
      deliverables: ["character_card_json"],
    },
    sources: unsafe,
    projectRoot: process.cwd(),
  });
  assert.ok(
    result.issues.some(
      (item) => item.rule === "ui.correctness.html_entity_operator_spacing",
    ),
  );
  assert.equal(
    result.issues.some(
      (item) => item.rule === "ui.runtime.pagehide_local_listener",
    ),
    false,
  );
});

test("inline message scripts accept spaced boolean operators", async () => {
  const safe = sources("light", 6);
  const safeComponent = safe.ui.find((entry) => entry.value.ui_component);
  safeComponent.value.ui_component.source = {
    mode: "inline",
    html: "",
    css: "",
    js: "const current={cleanup(){}}; if(current && current.cleanup){current.cleanup()}",
  };
  const variableBySource = new Map(
    safe.mvu[0].value.mvu.variables.map((item) => [item.source_path, item]),
  );
  const result = validateUiExperienceSources({
    project: { features: { status_ui: true } },
    sources: safe,
    variableBySource,
  });
  assert.equal(
    result.issues.some(
      (item) => item.rule === "ui.correctness.html_entity_operator_spacing",
    ),
    false,
  );
});

test("compiled message UI rejects invalid final JavaScript", () => {
  const broken = sources("light", 6);
  const brokenComponent = broken.ui.find((entry) => entry.value.ui_component);
  brokenComponent.value.ui_component.source = {
    mode: "inline",
    html: "",
    css: "",
    js: "if (",
  };
  const result = compileUiExperienceRegexes({
    project: { features: { status_ui: true } },
    sources: broken,
  });
  assert.ok(
    result.issues.some((item) => item.rule === "ui.runtime.script_syntax"),
  );
});

test("player-visible internal machine keys produce UX warnings rather than blockers", () => {
  const exposed = sources("light", 6);
  const bindingSet = exposed.ui.find((entry) => entry.value.ui_bindings);
  bindingSet.value.ui_bindings.bindings[0].label = "scene_id";
  const variableBySource = new Map(
    exposed.mvu[0].value.mvu.variables.map((item) => [item.source_path, item]),
  );
  const result = validateUiExperienceSources({
    project: { features: { status_ui: true } },
    sources: exposed,
    variableBySource,
  });
  assert.equal(result.issues.some((item) => item.rule === "ui.localization.internal_key_visible"), false);
  assert.ok(result.warnings.some((item) => item.rule === "ui.localization.internal_key_visible"));
});

test("medium UI capability can be concentrated into one multi-module workspace page", async () => {
  const consolidated = sources("medium", 6);
  const intro = consolidated.ui.find(
    (entry) => entry.value.ui_component?.id === "intro",
  ).value.ui_component;
  intro.role = "setup";
  intro.preset = "player_setup";
  intro.layout = { kind: "form", groups: [] };

  const status = consolidated.ui.find(
    (entry) => entry.value.ui_component?.id === "status",
  ).value.ui_component;
  const bindingSet = consolidated.ui.find(
    (entry) => entry.value.ui_bindings,
  ).value.ui_bindings;
  const declarations = consolidated.mvu[0].value.mvu.variables;
  const moduleIds = [
    "overview",
    "character",
    "world",
    "tasks",
    "inventory",
    "relationships",
    "intelligence",
    "location",
  ];
  bindingSet.bindings = [];
  declarations.length = 0;
  status.binding_refs = [];
  const playerEntries = [
    ["overview", "概览"],
    ["people", "人物"],
    ["journey", "行旅"],
    ["affairs", "事务"],
    ["records", "案牍"],
  ];
  status.layout.groups = playerEntries.map(([id, label]) => ({
    id,
    label,
    binding_refs: [],
    collapsed: false,
  }));
  moduleIds.forEach((id, index) => {
    const bindingId = `module_${index}`;
    const sourcePath = `workspace.${id}`;
    declarations.push({
      source_path: sourcePath,
      runtime_path: `stat_data.${sourcePath}`,
      type: "string",
      default: "未记录",
      constraints: {},
      writer: { id: "state", operations: ["set"] },
      readers: ["status_ui"],
      visibility: "player",
    });
    bindingSet.bindings.push({
      id: bindingId,
      component_ref: "ui_component:status",
      slot: id,
      source_path: sourcePath,
      presentation: "text",
      label: `模块${index + 1}`,
      missing_value: "未记录",
      priority: index,
      collection: { empty: "未记录", limit: 20, sort: "source" },
    });
    status.binding_refs.push(bindingId);
    status.layout.groups[index % playerEntries.length].binding_refs.push(bindingId);
  });

  const variableBySource = new Map(
    declarations.map((declaration) => [declaration.source_path, declaration]),
  );
  const result = validateUiExperienceSources({
    project: { features: { status_ui: true } },
    sources: consolidated,
    variableBySource,
  });
  assert.equal(
    result.issues.some((item) =>
      [
        "ui.experience_level",
        "ui.capability_floor",
        "ui.navigation.player_entry_limit",
      ].includes(item.rule),
    ),
    false,
    JSON.stringify(result.issues),
  );
});

test("player workspaces may exceed five primary entries with a UX warning", () => {
  const overloaded = sources("medium", 6);
  const status = overloaded.ui.find(
    (entry) => entry.value.ui_component?.id === "status",
  ).value.ui_component;
  status.layout.groups = Array.from({ length: 6 }, (_, index) => ({
    id: `entry_${index}`,
    label: `入口${index + 1}`,
    binding_refs: index === 0 ? ["health"] : [],
    collapsed: false,
  }));
  const variableBySource = new Map(
    overloaded.mvu[0].value.mvu.variables.map((item) => [item.source_path, item]),
  );
  const result = validateUiExperienceSources({
    project: { features: { status_ui: true } },
    sources: overloaded,
    variableBySource,
  });
  assert.equal(result.issues.some((item) => item.rule === "ui.navigation.player_entry_limit"), false);
  assert.ok(result.warnings.some((item) => item.rule === "ui.navigation.player_entry_limit"));
});

test("UI level capability gaps are advisory rather than build blockers", async () => {
  const hollow = sources("heavy", 24);
  for (const entry of hollow.ui.filter((item) => item.value.ui_component)) {
    entry.value.ui_component.role = "workspace";
    entry.value.ui_component.preset = "custom_panel";
  }
  hollow.ui[0].value.ui_experience.navigation.kind = "tabs";
  const result = await validateRuntimeSources({
    project: {
      project: { target: "character_card" },
      features: { status_ui: true, mvu: true, ejs: false },
      deliverables: ["character_card_json"],
    },
    sources: hollow,
    projectRoot: process.cwd(),
  });
  assert.equal(result.issues.some((item) => item.rule === "ui.capability_floor"), false);
  assert.ok(result.warnings.filter((item) => item.rule === "ui.capability_floor").length >= 4);
});
