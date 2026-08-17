import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import YAML from "yaml";

const STYLE_SLOT = "<!-- RP_UI_STYLES -->";
const SCRIPT_SLOT = "<!-- RP_UI_SCRIPTS -->";
const FRAGMENT_PATTERN = /<!--\s*RP_UI_FRAGMENT:([A-Za-z0-9_.-]+)\s*-->/g;

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 必须是非空字符串`);
  return value.trim();
}

function assertStringArray(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw new Error(`${label} 必须是${allowEmpty ? "" : "非空"}字符串数组`);
  return value.map((item, index) => assertString(item, `${label}[${index}]`));
}

function resolveInside(root, reference, label) {
  const absolute = path.resolve(root, assertString(reference, label));
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} 不能逃逸 UI 应用目录: ${reference}`);
  return absolute;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function exactlyOnce(source, marker, label) {
  const count = source.split(marker).length - 1;
  if (count !== 1) throw new Error(`${label} 必须且只能出现一次，当前为 ${count} 次`);
}

function parseManifestText(text, file) {
  if (path.extname(file).toLowerCase() === ".json") return JSON.parse(text);
  return YAML.parse(text);
}

export async function loadUiAppManifest(manifestPath) {
  const absoluteManifest = path.resolve(manifestPath);
  const raw = await readFile(absoluteManifest, "utf8");
  const document = parseManifestText(raw, absoluteManifest);
  assertObject(document, "UI 应用清单");
  const app = document.ui_app ?? document;
  assertObject(app, "ui_app");
  if (document.schema_version !== undefined && document.schema_version !== "1.0.0") {
    throw new Error(`不支持的 UI 应用清单版本: ${document.schema_version}`);
  }

  const root = path.dirname(absoluteManifest);
  const entryHtml = assertString(app.entry_html, "ui_app.entry_html");
  const styles = assertStringArray(app.styles, "ui_app.styles");
  const scripts = assertStringArray(app.scripts, "ui_app.scripts");
  const output = assertString(app.output, "ui_app.output");
  const fragments = Array.isArray(app.fragments) ? app.fragments.map((fragment, index) => {
    assertObject(fragment, `ui_app.fragments[${index}]`);
    return {
      slot: assertString(fragment.slot, `ui_app.fragments[${index}].slot`),
      file: assertString(fragment.file, `ui_app.fragments[${index}].file`),
    };
  }) : [];

  return {
    manifestPath: absoluteManifest,
    root,
    manifest: document,
    app: {
      id: assertString(app.id, "ui_app.id"),
      surface: assertString(app.surface, "ui_app.surface"),
      experience_level: assertString(app.experience_level, "ui_app.experience_level"),
      entry_html: entryHtml,
      styles,
      scripts,
      fragments,
      output,
      mock_state: typeof app.mock_state === "string" && app.mock_state.trim() ? app.mock_state.trim() : null,
      preview_output: typeof app.preview_output === "string" && app.preview_output.trim() ? app.preview_output.trim() : null,
      script_wrapper: app.script_wrapper === "none" ? "none" : "iife",
    },
  };
}

async function readSource(root, reference, label) {
  const absolute = resolveInside(root, reference, label);
  return { absolute, text: await readFile(absolute, "utf8") };
}

function fileBanner(kind, reference) {
  return `/* ===== ${kind}: ${reference.replaceAll("\\", "/")} ===== */`;
}

export async function buildUiApp(manifestPath, options = {}) {
  const loaded = await loadUiAppManifest(manifestPath);
  const { root, app } = loaded;
  const entry = await readSource(root, app.entry_html, "ui_app.entry_html");
  exactlyOnce(entry.text, STYLE_SLOT, STYLE_SLOT);
  exactlyOnce(entry.text, SCRIPT_SLOT, SCRIPT_SLOT);

  let html = entry.text;
  const fragmentMap = new Map();
  for (const fragment of app.fragments) {
    if (fragmentMap.has(fragment.slot)) throw new Error(`重复的 HTML 片段槽位: ${fragment.slot}`);
    const source = await readSource(root, fragment.file, `fragment ${fragment.slot}`);
    fragmentMap.set(fragment.slot, source.text);
  }
  html = html.replace(FRAGMENT_PATTERN, (marker, slot) => {
    if (!fragmentMap.has(slot)) throw new Error(`入口 HTML 使用了未声明的片段槽位: ${slot}`);
    return `<!-- fragment:${slot} -->\n${fragmentMap.get(slot)}\n<!-- /fragment:${slot} -->`;
  });
  for (const slot of fragmentMap.keys()) {
    if (!entry.text.includes(`RP_UI_FRAGMENT:${slot}`)) throw new Error(`已声明但入口 HTML 未使用的片段槽位: ${slot}`);
  }

  const styleParts = [];
  for (const reference of app.styles) {
    const source = await readSource(root, reference, `style ${reference}`);
    if (/<\/style\s*>/i.test(source.text)) throw new Error(`CSS 源文件不能包含 </style>: ${reference}`);
    styleParts.push(`${fileBanner("style", reference)}\n${source.text.trim()}`);
  }

  const scriptParts = [];
  for (const reference of app.scripts) {
    const source = await readSource(root, reference, `script ${reference}`);
    if (/<\/script\s*>/i.test(source.text)) throw new Error(`JavaScript 源文件不能包含 </script>: ${reference}`);
    if (/^\s*(?:import|export)\s/m.test(source.text)) {
      throw new Error(`classic_concat 不接受 import/export；请改为共享命名空间/IIFE，或使用项目自有 compiled_frontend 构建: ${reference}`);
    }
    scriptParts.push(`${fileBanner("script", reference)}\n${source.text.trim()}`);
  }

  const css = styleParts.join("\n\n");
  const rawJs = scriptParts.join("\n\n");
  const js = app.script_wrapper === "iife" ? `(() => {\n"use strict";\n${rawJs}\n})();` : rawJs;
  html = html.replace(STYLE_SLOT, `<style>\n${css}\n</style>`);
  html = html.replace(SCRIPT_SLOT, `<script>\n${js}\n</script>`);

  if (!/<!doctype\s+html/i.test(html) || !/<html\b/i.test(html) || !/<body\b/i.test(html)) {
    throw new Error("构建结果必须是包含 doctype、html 和 body 的完整 HTML 文档");
  }
  if (/RP_UI_(?:STYLES|SCRIPTS|FRAGMENT)/.test(html)) throw new Error("构建结果仍有未解析的 UI 槽位");

  const declaredOutput = options.output ? path.resolve(options.output) : path.resolve(root, app.output);
  let mockState = null;
  let mockValue = null;
  if (app.mock_state) {
    const mock = await readSource(root, app.mock_state, "ui_app.mock_state");
    mockValue = JSON.parse(mock.text);
    mockState = mock.absolute;
  }
  const previewOutput = !options.output && app.preview_output ? path.resolve(root, app.preview_output) : null;
  const previewHtml = previewOutput && mockValue !== null
    ? html.replace(/<script>/i, `<script>\nwindow.__RP_UI_MOCK__ = ${JSON.stringify(mockValue).replaceAll("<", "\\u003c")};\n</script>\n<script>`)
    : null;
  if (!options.dryRun) {
    await mkdir(path.dirname(declaredOutput), { recursive: true });
    await writeFile(declaredOutput, html, "utf8");
    if (previewOutput && previewHtml) {
      await mkdir(path.dirname(previewOutput), { recursive: true });
      await writeFile(previewOutput, previewHtml, "utf8");
    }
  }

  return {
    manifest: loaded.manifestPath,
    root,
    output: declaredOutput,
    dryRun: Boolean(options.dryRun),
    surface: app.surface,
    experienceLevel: app.experience_level,
    entryHtml: entry.absolute,
    styles: app.styles.length,
    scripts: app.scripts.length,
    fragments: app.fragments.length,
    mockState,
    previewOutput,
    previewBytes: previewHtml ? Buffer.byteLength(previewHtml) : null,
    bytes: Buffer.byteLength(html),
    sha256: sha256(html),
    html,
  };
}

export async function inspectUiApp(manifestPath, expectedOutput = null) {
  const loaded = await loadUiAppManifest(manifestPath);
  const result = await buildUiApp(manifestPath, { dryRun: true });
  const declaredOutput = path.resolve(loaded.root, loaded.app.output);
  const expected = expectedOutput ? path.resolve(expectedOutput) : null;
  let current = null;
  let outputMatches = null;
  try {
    current = await readFile(declaredOutput, "utf8");
    outputMatches = current === result.html;
  } catch {
    outputMatches = false;
  }
  return {
    ...result,
    declaredOutput,
    expectedOutput: expected,
    outputPathMatches: expected ? declaredOutput === expected : true,
    outputMatches,
  };
}
