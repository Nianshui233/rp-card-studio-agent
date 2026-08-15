import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) =>
  JSON.parse(
    readFileSync(
      path.join(root, "assets", "schemas", `${name}.schema.json`),
      "utf8",
    ),
  );
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
});
const validators = Object.fromEntries(
  ["ui-experience", "ui-theme", "ui-bindings", "ui-component"].map((name) => [
    name,
    ajv.compile(load(name)),
  ]),
);

function experience(level = "light", count = 6) {
  return {
    schema_version: "2.0.0",
    status: "locked",
    ui_experience: {
      enabled: true,
      experience_level: level,
      goals: ["world_immersion"],
      device_priority: "equal",
      theme_ref: "ui_theme:main",
      bindings_ref: "ui_bindings:main",
      surfaces: Array.from(
        { length: count },
        (_, index) => `ui_component:surface_${index}`,
      ),
      navigation: {
        kind: "tabs",
        primary_surface: "ui_component:surface_0",
        routes: [],
      },
      host_policy: {
        adapter: "tavern_helper_message",
        allow_remote_resources: false,
        allowed_interactions: ["static", "local_interaction"],
      },
      accessibility: {
        keyboard: true,
        color_independent: true,
        reduced_motion: true,
        live_updates: "polite",
      },
      performance: {
        max_component_bytes: 65536,
        max_total_bytes: 524288,
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
  };
}

test("UI experience levels describe ambition without imposing fixed page floors", () => {
  for (const level of [
    "basic_status",
    "light",
    "light_medium",
    "medium",
    "heavy",
    "super_heavy",
  ]) {
    const document = experience(level, 1);
    assert.equal(
      validators["ui-experience"](document),
      true,
      `${level}: ${JSON.stringify(validators["ui-experience"].errors)}`,
    );
  }
});

test("full UI levels accept a small number of complete pages instead of forcing one regex per feature", () => {
  for (const [level, count] of [
    ["light", 3],
    ["light_medium", 3],
    ["medium", 4],
    ["heavy", 5],
    ["super_heavy", 1],
  ]) {
    const document = experience(level, count);
    assert.equal(
      validators["ui-experience"](document),
      true,
      `${level}: ${JSON.stringify(validators["ui-experience"].errors)}`,
    );
  }
});

test("full UI levels allow the adapter selected for the project", () => {
  const document = experience("light", 6);
  document.ui_experience.host_policy.adapter = "sillytavern_regex";
  assert.equal(validators["ui-experience"](document), true);
});

test("parent-page host bridging needs no authorization switch", () => {
  const document = experience("light", 6);
  document.ui_experience.host_policy.allowed_interactions.push("host_bridge");
  assert.equal(
    validators["ui-experience"](document),
    true,
    JSON.stringify(validators["ui-experience"].errors),
  );
  assert.equal(
    Object.hasOwn(document.ui_experience.host_policy, "allow_host_fragile"),
    false,
  );
});

test("themes allow registered remote resources while retaining a distinctive design system", () => {
  const theme = {
    schema_version: "2.0.0",
    status: "locked",
    ui_theme: {
      id: "main",
      display_name: "密档灯箱",
      concept: "以潮湿档案纸和透光检视台为核心的调查界面。",
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
        scale: [0.75, 0.875, 1, 1.25, 1.75],
      },
      shape: { radius: "small", border_width: "hairline", shadow: "soft" },
      texture: "paper",
      signature: {
        kind: "seal",
        description: "每个关键结论以可翻转的朱印批注呈现。",
      },
      motion: "restrained",
      breakpoints: { narrow: 520, wide: 1100 },
      resources: {
        font_strategy: "system",
        icon_strategy: "inline_svg",
        remote_urls: [],
      },
    },
  };
  assert.equal(
    validators["ui-theme"](theme),
    true,
    JSON.stringify(validators["ui-theme"].errors),
  );
  theme.ui_theme.resources.remote_urls.push("https://example.test/font.woff2");
  assert.equal(validators["ui-theme"](theme), true);
  theme.ui_theme.resources.font_strategy = "remote";
  theme.ui_theme.resources.icon_strategy = "remote";
  assert.equal(validators["ui-theme"](theme), true);
});

test("all bundled UI component templates satisfy the UI 2.0 schema", () => {
  const directory = path.join(root, "assets", "templates", "ui", "components");
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".yaml"))
    .sort();
  assert.equal(files.length, 25);
  const ids = new Set();
  const markers = new Set();
  for (const file of files) {
    const document = parseYaml(
      readFileSync(path.join(directory, file), "utf8"),
    );
    assert.equal(
      validators["ui-component"](document),
      true,
      `${file}: ${JSON.stringify(validators["ui-component"].errors)}`,
    );
    assert.equal(
      ids.has(document.ui_component.id),
      false,
      `duplicate component id: ${document.ui_component.id}`,
    );
    assert.equal(
      markers.has(document.ui_component.trigger.marker),
      false,
      `duplicate component marker: ${document.ui_component.trigger.marker}`,
    );
    ids.add(document.ui_component.id);
    markers.add(document.ui_component.trigger.marker);
  }
});

test("level manifests keep entry and status applications integrated without page-count quotas", () => {
  const directory = path.join(root, "assets", "templates", "ui");
  const componentDirectory = path.join(directory, "components");
  const expected = {
    light: {
      file: "light.yaml",
      surfaces: 4,
      modules: 4,
      visual: "complete_restrained",
      interaction: "practical_polished",
      runtime: "not_required",
    },
    light_medium: {
      file: "light-medium.yaml",
      surfaces: 6,
      modules: 7,
      visual: "themed_tactile",
      interaction: "practical_connected",
      runtime: "not_required",
    },
    medium: {
      file: "medium.yaml",
      surfaces: 6,
      modules: 8,
      visual: "polished_layered",
      interaction: "rich",
      runtime: "optional",
    },
    heavy: {
      file: "heavy.yaml",
      surfaces: 7,
      modules: 12,
      visual: "immersive_cinematic",
      interaction: "advanced",
      runtime: "advanced_optional",
    },
    super_heavy: {
      file: "super-heavy.yaml",
      surfaces: 7,
      modules: 14,
      visual: "application_grade",
      interaction: "runtime_deep",
      runtime: "required",
    },
  };
  for (const [level, expectation] of Object.entries(expected)) {
    const manifest = parseYaml(
      readFileSync(path.join(directory, "levels", expectation.file), "utf8"),
    );
    assert.equal(manifest.level, level);
    assert.equal(manifest.component_templates.length, expectation.surfaces);
    assert.equal(
      new Set(manifest.component_templates).size,
      expectation.surfaces,
    );
    for (const template of manifest.component_templates) {
      assert.doesNotThrow(() =>
        readFileSync(path.join(componentDirectory, template), "utf8"),
      );
    }
    assert.equal(manifest.requirements.page_count_rule, "none");
    assert.equal(manifest.requirements.feature_reduction, "none");
    assert.equal(manifest.requirements.visual_richness, expectation.visual);
    assert.equal(manifest.requirements.interaction_richness, expectation.interaction);
    assert.equal(manifest.requirements.application_runtime, expectation.runtime);
    assert.equal(manifest.workspace_modules.length, expectation.modules);
    assert.ok(manifest.component_templates.includes("project-portal.yaml"));
    assert.ok(manifest.component_templates.includes("status-terminal.yaml"));
    assert.equal(manifest.component_templates.includes("introduction-page.yaml"), false);
    assert.equal(manifest.component_templates.includes("player-setup.yaml"), false);
  }
});

test("super-heavy manifest defines independent frontend lifecycle acceptance", () => {
  const manifest = parseYaml(readFileSync(path.join(root, "assets", "templates", "ui", "levels", "super-heavy.yaml"), "utf8"));
  assert.equal(manifest.requirements.zero_layer_play, "supported");
  assert.ok(manifest.requirements.qa_focus.length >= 8);
  assert.ok(manifest.requirements.qa_focus.some((item) => item.includes("聊天切换隔离")));
});
