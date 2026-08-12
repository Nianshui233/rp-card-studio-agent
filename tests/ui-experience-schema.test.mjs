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

test("UI experience levels enforce basic, light, medium, and heavy component floors", () => {
  for (const [level, count] of [
    ["basic_status", 1],
    ["light", 6],
    ["medium", 12],
    ["heavy", 24],
  ]) {
    const valid = experience(level, count);
    assert.equal(
      validators["ui-experience"](valid),
      true,
      JSON.stringify(validators["ui-experience"].errors),
    );
    if (count > 1) {
      const invalid = experience(level, count - 1);
      assert.equal(
        validators["ui-experience"](invalid),
        false,
        `${level} accepted too few surfaces`,
      );
    }
  }
});

test("full UI levels require Tavern Helper message delivery", () => {
  const document = experience("light", 6);
  document.ui_experience.host_policy.adapter = "sillytavern_regex";
  assert.equal(validators["ui-experience"](document), false);
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

test("themes forbid remote resources and require a distinctive design system", () => {
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
  assert.equal(validators["ui-theme"](theme), false);
});

test("all bundled UI component templates satisfy the UI 2.0 schema", () => {
  const directory = path.join(root, "assets", "templates", "ui", "components");
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".yaml"))
    .sort();
  assert.equal(files.length, 24);
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

test("level manifests define complete light, medium, and heavy capability sets", () => {
  const directory = path.join(root, "assets", "templates", "ui");
  const componentDirectory = path.join(directory, "components");
  const expected = { light: 6, medium: 12, heavy: 24 };
  for (const [level, count] of Object.entries(expected)) {
    const manifest = parseYaml(
      readFileSync(path.join(directory, "levels", `${level}.yaml`), "utf8"),
    );
    assert.equal(manifest.level, level);
    assert.equal(manifest.component_templates.length, count);
    assert.equal(new Set(manifest.component_templates).size, count);
    for (const template of manifest.component_templates) {
      assert.doesNotThrow(() =>
        readFileSync(path.join(componentDirectory, template), "utf8"),
      );
    }
    assert.equal(manifest.requirements.minimum_components, count);
  }
});
