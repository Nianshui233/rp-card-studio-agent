import assert from "node:assert/strict";
import test from "node:test";

import {
  applySillyTavernRegexAdapter,
  validateRuntimeSources,
} from "../scripts/rp-card-runtime.mjs";
import {
  compileUiExperienceRegexes,
  stableUiRegexId,
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
              allow_host_fragile: false,
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
    /binding\.runtime_path\|\|binding\.source_path/,
  );
  assert.match(status.replaceString, /eventRemoveListener/);
  assert.match(status.replaceString, /pagehide/);
  assert.doesNotMatch(status.replaceString, /\\\$&|\$(?:[&`']|\d{1,2})/);
  assert.equal((status.replaceString.match(/wireLocal\(\)/g) ?? []).length, 1);
  assert.equal(
    (status.replaceString.match(/wirePrimary\(\)/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(
    status.replaceString,
    /window\.parent|parent\.document|https?:\/\//i,
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

test("UI validation rejects unsafe parent access and level underfill", async () => {
  const unsafe = sources("medium", 6);
  const unsafeComponent = unsafe.ui.find((entry) => entry.value.ui_component);
  unsafeComponent.value.ui_component.source = {
    mode: "inline",
    html: "",
    css: "",
    js: 'window.parent.document.querySelector("#send_textarea")',
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
  assert.ok(result.issues.some((item) => item.rule === "ui.experience_level"));
  assert.ok(
    result.issues.some((item) => item.rule === "ui.security.parent_access"),
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
    result.issues.some((item) => item.rule === "ui.security.replacement_token"),
  );
});

test("UI levels require real capability coverage rather than duplicated empty panels", async () => {
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
  assert.ok(
    result.issues.filter((item) => item.rule === "ui.capability_floor")
      .length >= 4,
  );
});
