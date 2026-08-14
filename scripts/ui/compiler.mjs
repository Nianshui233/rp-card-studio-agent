import { createHash } from "node:crypto";
import { Script } from "node:vm";

const LEVEL_REQUIREMENTS = Object.freeze({
  basic_status: { minimumSurfaces: 1, workspaceModules: 1, narrative: 0 },
  light: { minimumSurfaces: 3, workspaceModules: 4, narrative: 1 },
  medium: { minimumSurfaces: 4, workspaceModules: 8, narrative: 2 },
  heavy: { minimumSurfaces: 5, workspaceModules: 12, narrative: 3 },
});
const DASHBOARD_PRESETS = new Set([
  "status_terminal",
  "task_center",
  "inventory_center",
  "relationship_center",
  "intelligence_center",
  "investigation_board",
  "map_center",
  "battle_report",
  "custom_panel",
]);
const MESSAGE_PRESETS = new Set([
  "update_report",
  "roll_result",
  "choice_panel",
  "notification",
]);
const HOST_API_INTERACTIONS = new Set([
  "message_read",
  "message_write",
  "slash_command",
  "opening_swipe",
  "host_bridge",
  "host_fragile",
]);
const PLAYER_VISIBLE_INTERNAL_KEYS = new Set([
  "status",
  "scene_id",
  "scene_ref",
  "region_id",
  "area_id",
  "display_name",
  "setup_status",
  "phase_id",
  "current_branch_status",
  "baseline_unmodified",
  "awaiting_player_declaration",
]);

function clone(value) {
  return structuredClone(value);
}

function issue(path, rule, message) {
  return { path, rule, message };
}

function values(sources) {
  return Array.isArray(sources?.ui)
    ? sources.ui.map((entry) => entry.value).filter(Boolean)
    : [];
}

export function collectUiExperienceSources(sources) {
  const uiValues = values(sources);
  return {
    experience:
      uiValues.find((source) => source.ui_experience)?.ui_experience ?? null,
    themes: uiValues
      .filter((source) => source.ui_theme)
      .map((source) => source.ui_theme),
    bindings: uiValues
      .filter((source) => source.ui_bindings)
      .map((source) => source.ui_bindings),
    components: uiValues
      .filter((source) => source.ui_component)
      .map((source) => source.ui_component),
  };
}

export function isUiExperienceEnabled(project, sources) {
  const experience = collectUiExperienceSources(sources).experience;
  return project?.features?.status_ui === true && experience?.enabled === true;
}

export function stableUiRegexId(componentId) {
  const bytes = createHash("sha256")
    .update(`rp-card-studio:ui-component:${componentId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isManagedUiComponentRegex(script) {
  const tracking = script?.rp_card_studio;
  return (
    tracking?.generated === true &&
    tracking.kind === "ui_component" &&
    typeof tracking.source_id === "string" &&
    script.id === stableUiRegexId(tracking.source_id)
  );
}

function duplicateIds(items) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  return [...duplicates];
}

function scanInlineSource(component) {
  const issues = [];
  if (component.source?.mode !== "inline") return issues;
  const base = `/runtime/ui/components/${component.id}/source`;
  const html = String(component.source.html ?? "");
  const css = String(component.source.css ?? "");
  const js = String(component.source.js ?? "");
  const all = `${html}\n${css}\n${js}`;

  if (/\$(?:[&`']|\d{1,2})/.test(all))
    issues.push(issue(base, "ui.correctness.replacement_token", "Inline source contains a raw SillyTavern replacement token; escape it, construct it at runtime, or use a Forge-controlled capture slot"));

  if (/&&[A-Za-z_$]|\|\|[A-Za-z_$]/.test(js))
    issues.push(issue(`${base}/js`, "ui.correctness.html_entity_operator_spacing", "Keep whitespace after && and || because Tavern Helper HTML parsing can reinterpret sequences such as &&current as a named entity"));

  if (/(?:#sheld\b|#form_sheld\b|rp_card_studio_status_ui|persistent[_-]?status[_-]?(?:panel|bar))/i.test(all))
    issues.push(issue(base, "ui.user_constraint.persistent_status_panel", "The user explicitly forbids creating or reviving a page-level persistent status panel"));

  return issues;
}
export function validateUiExperienceSources({
  project,
  sources,
  variableBySource = new Map(),
}) {
  const { experience, themes, bindings, components } =
    collectUiExperienceSources(sources);
  const issues = [];
  const warnings = [];
  if (!experience) return { issues, warnings, active: false };
  const base = "/runtime/ui_experience";
  if (Boolean(project?.features?.status_ui) !== Boolean(experience.enabled)) {
    issues.push(
      issue(
        base,
        "ui.lifecycle",
        "project.features.status_ui must match ui_experience.enabled",
      ),
    );
  }
  if (!experience.enabled) return { issues, warnings, active: false };

  const themeByRef = new Map(
    themes.map((theme) => [`ui_theme:${theme.id}`, theme]),
  );
  const bindingsByRef = new Map(
    bindings.map((binding) => [`ui_bindings:${binding.id}`, binding]),
  );
  const componentByRef = new Map(
    components.map((component) => [`ui_component:${component.id}`, component]),
  );
  for (const id of duplicateIds(themes))
    issues.push(
      issue(
        `${base}/themes`,
        "ui.id_duplicate",
        `Duplicate UI theme id: ${id}`,
      ),
    );
  for (const id of duplicateIds(bindings))
    issues.push(
      issue(
        `${base}/bindings`,
        "ui.id_duplicate",
        `Duplicate UI bindings id: ${id}`,
      ),
    );
  for (const id of duplicateIds(components))
    warnings.push(
      issue(
        `${base}/components`,
        "ui.id_duplicate",
        `Duplicate UI component id: ${id}`,
      ),
    );

  if (!themeByRef.has(experience.theme_ref))
    warnings.push(
      issue(
        `${base}/theme_ref`,
        "ui.reference",
        `Unknown UI theme: ${experience.theme_ref}`,
      ),
    );
  if (!bindingsByRef.has(experience.bindings_ref))
    warnings.push(
      issue(
        `${base}/bindings_ref`,
        "ui.reference",
        `Unknown UI bindings: ${experience.bindings_ref}`,
      ),
    );
  for (const ref of experience.surfaces ?? []) {
    if (!componentByRef.has(ref))
      warnings.push(
        issue(
          `${base}/surfaces`,
          "ui.reference",
          `Unknown UI component: ${ref}`,
        ),
      );
  }
  if (
    experience.navigation?.primary_surface &&
    !componentByRef.has(experience.navigation.primary_surface)
  ) {
    warnings.push(
      issue(
        `${base}/navigation/primary_surface`,
        "ui.reference",
        `Unknown primary UI component: ${experience.navigation.primary_surface}`,
      ),
    );
  }
  for (const route of experience.navigation?.routes ?? []) {
    if (!componentByRef.has(route.from) || !componentByRef.has(route.to))
      warnings.push(
        issue(
          `${base}/navigation/routes`,
          "ui.reference",
          `Navigation route references an unknown component: ${route.from} -> ${route.to}`,
        ),
      );
  }

  const levelRequirements = LEVEL_REQUIREMENTS[experience.experience_level] ?? {
    minimumSurfaces: 0,
    workspaceModules: 0,
    narrative: 0,
  };
  if ((experience.surfaces ?? []).length < levelRequirements.minimumSurfaces) {
    warnings.push(
      issue(
        `${base}/surfaces`,
        "ui.experience_level",
        `${experience.experience_level} UI requires at least ${levelRequirements.minimumSurfaces} complete message pages`,
      ),
    );
  }
  const selectedComponents = (experience.surfaces ?? [])
    .map((ref) => componentByRef.get(ref))
    .filter(Boolean);
  const selectedIds = new Set(
    selectedComponents.map((component) => component.id),
  );
  const roleCount = (role) =>
    selectedComponents.filter((component) => component.role === role).length;
  const presetCount = (preset) =>
    selectedComponents.filter((component) => component.preset === preset)
      .length;
  const workspaceComponents = selectedComponents.filter((component) =>
    ["dashboard", "workspace"].includes(component.role),
  );
  const workspaceModuleCount = workspaceComponents.reduce(
    (count, component) =>
      count +
      new Set(
        (component.layout?.groups ?? []).flatMap(
          (group) => group.binding_refs ?? [],
        ),
      ).size,
    0,
  );
  for (const component of workspaceComponents) {
    const primaryEntries = component.layout?.groups ?? [];
    if (primaryEntries.length > 5)
      warnings.push(
        issue(
          `${base}/components/${component.id}/layout/groups`,
          "ui.navigation.player_entry_limit",
          "A player-facing workspace may expose at most five primary entries; map additional internal modules into sections, secondary tabs, folds, or contextual entry points",
        ),
      );
  }
  const narrativeCount = roleCount("narrative_component");
  if (["light", "medium", "heavy"].includes(experience.experience_level)) {
    if (roleCount("entry") < 1)
      warnings.push(
        issue(
          `${base}/surfaces`,
          "ui.capability_floor",
          `${experience.experience_level} UI requires an entry surface`,
        ),
      );
    if (presetCount("status_terminal") < 1)
      warnings.push(
        issue(
          `${base}/surfaces`,
          "ui.capability_floor",
          `${experience.experience_level} UI requires a status terminal`,
        ),
      );
    if (narrativeCount < levelRequirements.narrative)
      warnings.push(
        issue(
          `${base}/surfaces`,
          "ui.capability_floor",
          `${experience.experience_level} UI requires at least ${levelRequirements.narrative} message-bound narrative components`,
        ),
      );
    if (workspaceModuleCount < levelRequirements.workspaceModules)
      warnings.push(
        issue(
          `${base}/surfaces`,
          "ui.capability_floor",
          `${experience.experience_level} UI requires at least ${levelRequirements.workspaceModules} populated modules inside its dashboard/workspace pages`,
        ),
      );
  }
  if (["medium", "heavy"].includes(experience.experience_level)) {
    if (roleCount("setup") < 1)
      warnings.push(
        issue(
          `${base}/surfaces`,
          "ui.capability_floor",
          `${experience.experience_level} UI requires a setup surface`,
        ),
      );
    if (workspaceComponents.length < 1)
      warnings.push(
        issue(
          `${base}/surfaces`,
          "ui.capability_floor",
          `${experience.experience_level} UI requires an integrated dashboard/workspace page`,
        ),
      );
  }
  if (experience.experience_level === "heavy") {
    if (!["hub", "mixed"].includes(experience.navigation?.kind))
      warnings.push(
        issue(
          `${base}/navigation/kind`,
          "ui.capability_floor",
          "heavy UI requires hub or mixed navigation",
        ),
      );
  }
  const selectedBindings =
    bindingsByRef.get(experience.bindings_ref)?.bindings ?? [];
  for (const binding of selectedBindings) {
    const componentId = binding.component_ref.replace(/^ui_component:/, "");
    if (!selectedIds.has(componentId))
      issues.push(
        issue(
          `${base}/bindings/${binding.id}/component_ref`,
          "ui.reference",
          `Binding targets an inactive UI component: ${binding.component_ref}`,
        ),
      );
    const variable = variableBySource.get(binding.source_path);
    if (!variable)
      issues.push(
        issue(
          `${base}/bindings/${binding.id}/source_path`,
          "ui.source_path",
          `UI binding references an unknown variable: ${binding.source_path}`,
        ),
      );
    else if (!(variable.readers ?? []).includes("status_ui"))
      issues.push(
        issue(
          `${base}/bindings/${binding.id}/source_path`,
          "ui.reader",
          `Variable is not readable by status_ui: ${binding.source_path}`,
        ),
      );
    const visibleLabel = String(binding.label ?? "").trim().toLowerCase();
    if (PLAYER_VISIBLE_INTERNAL_KEYS.has(visibleLabel))
      warnings.push(
        issue(
          `${base}/bindings/${binding.id}/label`,
          "ui.localization.internal_key_visible",
          `Player-visible labels must describe meaning in Chinese instead of exposing the internal key: ${binding.label}`,
        ),
      );
  }
  for (const component of selectedComponents) {
    for (const bindingId of component.binding_refs ?? []) {
      if (!selectedBindings.some((binding) => binding.id === bindingId))
        issues.push(
          issue(
            `${base}/components/${component.id}/binding_refs`,
            "ui.reference",
            `Component references an unknown binding: ${bindingId}`,
          ),
        );
    }
    for (const interaction of component.interactions ?? []) {
      if (
        !(experience.host_policy?.allowed_interactions ?? []).includes(
          interaction,
        )
      )
        issues.push(
          issue(
            `${base}/components/${component.id}/interactions`,
            "ui.interaction",
            `Interaction is not allowed by the project host policy: ${interaction}`,
          ),
        );
    }
    issues.push(...scanInlineSource(component));
  }
  const totalEstimate = selectedComponents.reduce(
    (sum, component) =>
      sum +
      String(component.source?.html ?? "").length +
      String(component.source?.css ?? "").length +
      String(component.source?.js ?? "").length,
    0,
  );
  if (totalEstimate > experience.performance.max_total_bytes)
    warnings.push(
      issue(
        `${base}/performance/max_total_bytes`,
        "ui.performance",
        `UI source estimate ${totalEstimate} exceeds the project total budget ${experience.performance.max_total_bytes}`,
      ),
    );
  if (experience.host_policy?.adapter === "tavern_helper_message")
    warnings.push(
      issue(
        `${base}/host_policy/adapter`,
        "ui.runtime_not_run",
        "Message UI requires target-host iframe execution evidence; keep runtime acceptance at not_run until verified",
      ),
    );
  return { issues, warnings, active: true };
}

function cssEscape(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function themeCss(theme) {
  const p = theme.palette;
  const display = theme.typography.display;
  const body = theme.typography.body;
  const utility = theme.typography.utility;
  const radius =
    { none: "0", small: "5px", medium: "10px", large: "18px", mixed: "12px" }[
      theme.shape.radius
    ] ?? "10px";
  const shadow =
    {
      none: "none",
      soft: "0 12px 40px rgba(0,0,0,.18)",
      hard: "6px 6px 0 rgba(0,0,0,.35)",
      glow: `0 0 30px ${p.primary}30`,
    }[theme.shape.shadow] ?? "none";
  return `:root{--rp-bg:${p.background};--rp-surface:${p.surface};--rp-surface-alt:${p.surface_alt};--rp-primary:${p.primary};--rp-secondary:${p.secondary};--rp-text:${p.text};--rp-muted:${p.muted};--rp-success:${p.success};--rp-warning:${p.warning};--rp-danger:${p.danger};--rp-border:${p.border};--rp-radius:${radius};--rp-shadow:${shadow};--rp-display:${display};--rp-body:${body};--rp-utility:${utility}}`;
}

function baseCss(theme) {
  const narrow = theme.breakpoints.narrow;
  const texture =
    theme.texture === "scanline"
      ? '.rp-shell:before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(255,255,255,.025) 3px 4px)}'
      : theme.texture === "grid"
        ? '.rp-shell:before{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(var(--rp-border)22 1px,transparent 1px),linear-gradient(90deg,var(--rp-border)22 1px,transparent 1px);background-size:22px 22px}'
        : "";
  return `${themeCss(theme)}*{box-sizing:border-box}body{margin:0;padding:0;background:transparent;color:var(--rp-text);font-family:var(--rp-body),system-ui,sans-serif}.rp-shell{position:relative;isolation:isolate;overflow:hidden;margin:8px 0;border:1px solid var(--rp-border);border-radius:var(--rp-radius);background:linear-gradient(145deg,var(--rp-surface),var(--rp-bg));box-shadow:var(--rp-shadow)}${texture}.rp-head{position:relative;padding:18px 20px;border-bottom:1px solid var(--rp-border)}.rp-eyebrow{font:600 11px/1.2 var(--rp-utility),monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--rp-primary)}.rp-title{margin:5px 0 0;font:700 clamp(20px,4vw,34px)/1.05 var(--rp-display),system-ui}.rp-subtitle{margin:8px 0 0;color:var(--rp-muted);max-width:70ch}.rp-body{position:relative;padding:16px 20px}.rp-copy{margin:0 0 10px;line-height:1.7}.rp-tabs{display:flex;gap:8px;overflow:auto;padding:10px 12px;border-bottom:1px solid var(--rp-border)}.rp-tab,.rp-action,.rp-choice{appearance:none;min-width:44px;min-height:44px;border:1px solid var(--rp-border);border-radius:999px;background:var(--rp-surface-alt);color:var(--rp-text);padding:10px 14px;font:600 12px/1 var(--rp-utility),monospace;cursor:pointer}.rp-tab[aria-selected=true],.rp-action:hover,.rp-choice:hover{border-color:var(--rp-primary);color:var(--rp-primary)}.rp-tab:focus-visible,.rp-action:focus-visible,.rp-choice:focus-visible,.rp-field input:focus-visible,.rp-field textarea:focus-visible{outline:2px solid var(--rp-primary);outline-offset:2px}.rp-panel[hidden]{display:none}.rp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));align-items:start;gap:10px}.rp-card{min-width:0;padding:12px;border:1px solid var(--rp-border);border-radius:calc(var(--rp-radius) * .75);background:var(--rp-surface-alt)}.rp-card h3{margin:0 0 9px;font:650 13px/1.25 var(--rp-display),system-ui;color:var(--rp-primary)}.rp-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:5px 0;border-bottom:1px dashed color-mix(in srgb,var(--rp-border),transparent 35%)}.rp-label{color:var(--rp-muted);overflow-wrap:anywhere}.rp-value{font-family:var(--rp-utility),monospace;font-weight:650;text-align:right;overflow-wrap:anywhere}.rp-meter{height:7px;margin-top:5px;border-radius:999px;background:var(--rp-bg);overflow:hidden}.rp-meter>span{display:block;height:100%;width:0;background:var(--rp-primary);transition:width .25s}.rp-list{display:flex;flex-wrap:wrap;gap:6px}.rp-chip{padding:4px 7px;border:1px solid var(--rp-border);border-radius:999px;color:var(--rp-muted);font-size:11px}.rp-state{padding:18px;color:var(--rp-muted);text-align:center}.rp-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.rp-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.rp-field{display:grid;gap:5px}.rp-field input,.rp-field textarea{width:100%;border:1px solid var(--rp-border);border-radius:7px;background:var(--rp-bg);color:var(--rp-text);padding:9px;font:inherit}.rp-field textarea{min-height:88px;resize:vertical}.rp-fallback{white-space:pre-wrap;line-height:1.6}@media(max-width:${narrow}px){.rp-head,.rp-body{padding:14px}.rp-form{grid-template-columns:1fr}.rp-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.rp-row{grid-template-columns:1fr}.rp-value{text-align:left}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}`;
}

function componentHtml(component) {
  const body = (component.content.body ?? [])
    .map((paragraph) => `<p class="rp-copy">${escapeHtml(paragraph)}</p>`)
    .join("");
  const action = component.content.primary_action
    ? `<div class="rp-actions"><button class="rp-action" type="button" data-rp-primary>${escapeHtml(component.content.primary_action)}</button></div>`
    : "";
  if (component.preset === "player_setup")
    return `<div class="rp-form" data-rp-form></div>${action}`;
  if (DASHBOARD_PRESETS.has(component.preset)) {
    const groups = (component.layout.groups ?? [])
      .map(
        (group, index) =>
          `<section class="rp-panel" data-rp-panel="${escapeHtml(group.id)}"${index === 0 ? "" : " hidden"}><div class="rp-grid" data-rp-group="${escapeHtml(group.id)}"></div></section>`,
      )
      .join("");
    const tabs = (component.layout.groups ?? [])
      .map(
        (group, index) =>
          `<button class="rp-tab" type="button" data-rp-tab="${escapeHtml(group.id)}" aria-selected="${index === 0}">${escapeHtml(group.label)}</button>`,
      )
      .join("");
    return `${tabs ? `<nav class="rp-tabs" aria-label="${escapeHtml(component.display_name)}">${tabs}</nav>` : ""}${groups || '<div class="rp-grid" data-rp-group="main"></div>'}`;
  }
  if (component.preset === "choice_panel")
    return `${body}<div class="rp-grid" data-rp-choices></div>`;
  if (MESSAGE_PRESETS.has(component.preset))
    return `${body}<div class="rp-fallback" data-rp-message></div>`;
  return `${body}${action}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

function runtimeSource(component, componentBindings, theme, experience) {
  const config = {
    id: component.id,
    marker: component.trigger.marker,
    preset: component.preset,
    dataMode: component.data_contract.mode,
    payloadFormat: component.data_contract.payload_format,
    bindings: componentBindings.map((binding) => clone(binding)),
    groups: clone(component.layout.groups ?? []),
    states: clone(component.states),
    interactions: clone(component.interactions ?? []),
    primaryAction: component.content.primary_action,
    routes: clone(experience.navigation?.routes ?? []),
  };
  const serialized = JSON.stringify(config).replace(
    /[<>&$\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  const generatedRuntime = `(function(){"use strict";const config=${serialized};const root=document.querySelector('[data-rp-ui-root="${cssEscape(component.id)}"]');if(!root)return;const ownerKey='__rpCardStudioUi:'+config.id;const previous=globalThis[ownerKey];if(previous && typeof previous.cleanup==='function')previous.cleanup();const state=root.querySelector('[data-rp-state]');const q=(s,p=root)=>(p||root).querySelector(s);const qa=(s,p=root)=>[...(p||root).querySelectorAll(s)];const text=(node,value)=>{if(node)node.textContent=value==null||value===''?'—':String(value)};const pathGet=(value,path)=>String(path||'').split('.').reduce((current,key)=>current==null?undefined:current[key],value);const showState=(kind,message)=>{if(!state)return;state.hidden=false;state.dataset.kind=kind;text(state,message||config.states[kind]||config.states.degraded)};const hideState=()=>{if(state)state.hidden=true};const currentId=()=>{try{const id=getCurrentMessageId();return Number.isInteger(id)?id:null}catch(_error){return null}};const currentMessage=()=>{const id=currentId();if(id===null||typeof getChatMessages!=='function')return null;const item=getChatMessages(id)?.[0];return item?.message??null};const currentVariables=()=>{const id=currentId();if(id===null||typeof getVariables!=='function')return null;return getVariables({type:'message',message_id:id})};const tone=(binding,value)=>{for(const rule of binding.tones||[]){const ok=rule.operator==='lt'?value<rule.value:rule.operator==='lte'?value<=rule.value:rule.operator==='eq'?Object.is(value,rule.value):rule.operator==='gte'?value>=rule.value:value>rule.value;if(ok)return rule.tone}return'neutral'};const make=(tag,className)=>{const node=document.createElement(tag);if(className)node.className=className;return node};const renderValue=(container,binding,value)=>{container.replaceChildren();if(binding.presentation==='progress'||binding.presentation==='meter'||binding.presentation==='resource_meter'){const row=make('div','rp-row');const label=make('span','rp-label');const output=make('span','rp-value');text(label,binding.label);text(output,value??binding.missing_value);row.append(label,output);const meter=make('div','rp-meter');const bar=make('span');const min=binding.range?.minimum??0,max=binding.range?.maximum??100,num=Number(value);const pct=Number.isFinite(num)&&max>min?Math.max(0,Math.min(100,(num-min)/(max-min)*100)):0;bar.style.width=pct+'%';bar.dataset.tone=tone(binding,num);meter.append(bar);container.append(row,meter);return}if(Array.isArray(value)||binding.presentation==='tags'||binding.presentation==='list'){const list=make('div','rp-list');const items=Array.isArray(value)?value:[];for(const item of items.slice(0,binding.collection?.limit??50)){const chip=make('span','rp-chip');text(chip,typeof item==='object'?JSON.stringify(item):item);list.append(chip)}if(items.length===0){const empty=make('span','rp-label');text(empty,binding.collection?.empty||binding.missing_value);list.append(empty)}container.append(list);return}if(value&&typeof value==='object'){const list=make('div','rp-grid');const entries=Object.entries(value).slice(0,binding.collection?.limit??50);for(const [key,item]of entries){const card=make('div','rp-card');const title=make('h3');text(title,key);const content=make('div','rp-value');text(content,typeof item==='object'?JSON.stringify(item):item);card.append(title,content);list.append(card)}if(entries.length===0){const empty=make('span','rp-label');text(empty,binding.collection?.empty||binding.missing_value);list.append(empty)}container.append(list);return}const row=make('div','rp-row');const label=make('span','rp-label');const output=make('span','rp-value');text(label,binding.label);text(output,value??binding.missing_value);row.append(label,output);container.append(row)};const renderBindings=(variables)=>{const stat=variables?.stat_data??{};for(const binding of config.bindings){const host=q('[data-rp-binding="'+binding.id+'"]');if(host)renderValue(host,binding,pathGet(stat,binding.runtime_path||binding.source_path))}};const parsePayload=(message)=>{if(!message)return null;const marker=config.marker.replace(/[.*+?^\${}()|[\\]\\]/g,'\\$&');const match=new RegExp('<'+marker+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+marker+'>','i').exec(message);if(!match)return null;const raw=match[1].trim();if(config.payloadFormat==='json'){try{return JSON.parse(raw)}catch(_error){return null}}if(config.payloadFormat==='lines')return raw.split(/\\r?\\n/).map(item=>item.replace(/^[-*\\d.)\\s]+/,'').trim()).filter(Boolean);return raw};const renderMessage=()=>{const payload=parsePayload(currentMessage());const host=q('[data-rp-message]');if(host)text(host,payload==null?config.states.empty:typeof payload==='string'?payload:JSON.stringify(payload,null,2));const choices=q('[data-rp-choices]');if(choices){choices.replaceChildren();const items=Array.isArray(payload)?payload:Array.isArray(payload?.choices)?payload.choices:[];for(const item of items){const value=typeof item==='string'?item:item?.text??item?.label;const button=make('button','rp-choice');button.type='button';text(button,value);button.addEventListener('click',async()=>{if(!value)return;try{if(typeof createChatMessages==='function')await createChatMessages([{role:'user',content:value}]);if(typeof triggerSlash==='function')await triggerSlash('/trigger')}catch(_error){showState('error')}});choices.append(button)}if(items.length===0)showState('empty')}};const renderForm=()=>{const form=q('[data-rp-form]');if(!form)return;for(const binding of config.bindings){const field=make('label','rp-field');const label=make('span','rp-label');text(label,binding.label);const input=binding.presentation==='text'?make('textarea'):make('input');input.dataset.rpInput=binding.id;input.placeholder=binding.missing_value||'';field.append(label,input);form.append(field)}const action=q('[data-rp-primary]');action?.addEventListener('click',async()=>{const lines=config.bindings.map(binding=>binding.label+': '+(q('[data-rp-input="'+binding.id+'"]')?.value||binding.missing_value||'未填写'));try{if(typeof createChatMessages==='function')await createChatMessages([{role:'user',content:lines.join('\\n')}]);if(typeof triggerSlash==='function')await triggerSlash('/trigger')}catch(_error){showState('error')}})};const wirePrimary=()=>{if(config.preset==='player_setup')return;const action=q('[data-rp-primary]');const route=(config.routes||[]).find(item=>item.from==='ui_component:'+config.id);if(!action||!route)return;action.onclick=async()=>{try{if(route.action==='opening_swipe' && typeof setChatMessages==='function')await setChatMessages([{message_id:route.message_id,swipe_id:route.swipe_id}]);else if(route.action==='message_action'){if(typeof createChatMessages==='function')await createChatMessages([{role:'user',content:route.prompt}]);if(typeof triggerSlash==='function')await triggerSlash('/trigger')}}catch(_error){showState('error')}}};const wireLocal=()=>{for(const tab of qa('[data-rp-tab]'))tab.onclick=()=>{for(const item of qa('[data-rp-tab]'))item.setAttribute('aria-selected',String(item===tab));for(const panel of qa('[data-rp-panel]'))panel.hidden=panel.dataset.rpPanel!==tab.dataset.rpTab}};const render=()=>{try{hideState();wireLocal();wirePrimary();if(config.preset==='player_setup')renderForm();if(config.dataMode==='stat_data'||config.dataMode==='stat_data_and_message'){const variables=currentVariables();if(!variables)showState('error');else renderBindings(variables)}if(config.dataMode==='current_message'||config.dataMode==='stat_data_and_message')renderMessage()}catch(_error){showState('error')}};render();if(typeof eventOn==='function'&&globalThis.Mvu?.events?.VARIABLE_UPDATE_ENDED)eventOn(Mvu.events.VARIABLE_UPDATE_ENDED,render);})();`;
  const hardenedRuntime = generatedRuntime
    .replace(
      /const marker=config\.marker\.replace\(.+?\);const match=/,
      "const marker=config.marker;const match=",
    )
    .replace(
      "const currentId=()=>{try{const id=getCurrentMessageId();return Number.isInteger(id)?id:null}catch(_error){return null}};const currentMessage=()=>{const id=currentId();if(id===null||typeof getChatMessages!=='function')return null;const item=getChatMessages(id)?.[0];return item?.message??null};const currentVariables=()=>{const id=currentId();if(id===null||typeof getVariables!=='function')return null;return getVariables({type:'message',message_id:id})};",
      "const currentId=()=>{try{const id=getCurrentMessageId();return Number.isInteger(id)?id:null}catch(_error){return null}};const capturedPayload=()=>document.querySelector('[data-rp-captured-payload]')?.textContent??null;const currentVariables=()=>{if(typeof getAllVariables==='function')return getAllVariables();const id=currentId();if(id===null||typeof getVariables!=='function')return null;return getVariables({type:'message',message_id:id})};",
    )
    .replace(
      "const renderBindings=(variables)=>{const stat=variables?.stat_data??{};for(const binding of config.bindings){const host=q('[data-rp-binding=\"'+binding.id+'\"]');if(host)renderValue(host,binding,pathGet(stat,binding.runtime_path||binding.source_path))}};",
      "const bindingValue=(stat,binding)=>{const paths=binding.read_paths||[binding.runtime_path,binding.source_path];let fallback;for(const path of paths){const value=pathGet(stat,path);if(fallback===undefined&&value!==undefined)fallback=value;if(value!==undefined&&value!==null&&value!==''&&value!=='uninitialized')return value}return fallback};const renderBindings=(variables)=>{const stat=variables?.stat_data??{};for(const binding of config.bindings){const host=q('[data-rp-binding=\"'+binding.id+'\"]');if(host)renderValue(host,binding,bindingValue(stat,binding))}};",
    )
    .replace(
      /const parsePayload=.*?;const renderMessage=/,
      "const parsePayload=(payloadText)=>{if(!payloadText)return null;const raw=payloadText.trim();if(config.payloadFormat==='json'){try{return JSON.parse(raw)}catch(_error){return null}}if(config.payloadFormat==='lines')return raw.split(/\\r?\\n/).map(item=>item.replace(/^[-*\\d.)\\s]+/,'').trim()).filter(Boolean);return raw};const renderMessage=",
    )
    .replace(
      "const renderMessage=()=>{const payload=parsePayload(currentMessage());",
      "const renderMessage=()=>{const payload=parsePayload(capturedPayload());",
    )
    .replace(
      "const render=()=>{try{hideState();wireLocal();wirePrimary();if(config.preset==='player_setup')renderForm();",
      "const render=()=>{try{hideState();",
    )
    .replace(
      "render();if(typeof eventOn==='function'&&globalThis.Mvu?.events?.VARIABLE_UPDATE_ENDED)eventOn(Mvu.events.VARIABLE_UPDATE_ENDED,render);})();",
      "wireLocal();wirePrimary();if(config.preset==='player_setup')renderForm();const usesState=config.dataMode==='stat_data'||config.dataMode==='stat_data_and_message';let mvuEvent=null;const bindMvu=()=>{if(usesState&&typeof eventOn==='function'&&globalThis.Mvu?.events?.VARIABLE_UPDATE_ENDED){mvuEvent=globalThis.Mvu.events.VARIABLE_UPDATE_ENDED;eventOn(mvuEvent,render)}};const start=async()=>{if(usesState&&typeof waitGlobalInitialized==='function')await waitGlobalInitialized('Mvu');render();bindMvu()};Promise.resolve(start()).catch(()=>showState('error'));const cleanup=()=>{if(mvuEvent && typeof eventRemoveListener==='function')eventRemoveListener(mvuEvent,render);mvuEvent=null};globalThis[ownerKey]={cleanup};globalThis.addEventListener?.('unload',cleanup,{once:true})})();",
    );
  return component.source?.mode === "inline" && component.source.js.trim()
    ? `${hardenedRuntime}\n${component.source.js}`
    : hardenedRuntime;
}

function componentFrontend(component, componentBindings, theme, experience) {
  const groups = new Map(
    (component.layout.groups ?? []).map((group) => [group.id, group]),
  );
  const bindingMarkup = componentBindings
    .map((binding) => {
      const group =
        (component.layout.groups ?? []).find((candidate) =>
          candidate.binding_refs.includes(binding.id),
        )?.id ?? "main";
      if (!groups.has(group) && component.layout.groups?.length) return "";
      return {
        group,
        html: `<article class="rp-card"><h3>${escapeHtml(binding.label)}</h3><div data-rp-binding="${escapeHtml(binding.id)}"></div></article>`,
      };
    })
    .filter(Boolean);
  let body = componentHtml(component);
  for (const group of component.layout.groups ?? []) {
    const markup = bindingMarkup
      .filter((item) => item.group === group.id)
      .map((item) => item.html)
      .join("");
    body = body.replace(
      `<div class="rp-grid" data-rp-group="${escapeHtml(group.id)}"></div>`,
      `<div class="rp-grid" data-rp-group="${escapeHtml(group.id)}">${markup}</div>`,
    );
  }
  if ((component.layout.groups ?? []).length === 0) {
    body = body.replace(
      '<div class="rp-grid" data-rp-group="main"></div>',
      `<div class="rp-grid" data-rp-group="main">${bindingMarkup.map((item) => item.html).join("")}</div>`,
    );
  }
  const customHtml =
    component.source?.mode === "inline" ? component.source.html : "";
  const css = `${baseCss(theme)}\n${component.source?.mode === "inline" ? component.source.css : ""}`;
  const runtime = runtimeSource(
    component,
    componentBindings,
    theme,
    experience,
  );
  const capturedPayload =
    component.trigger.kind === "block"
      ? '<script type="application/json" data-rp-captured-payload>$1</script>'
      : "";
  return [
    "```",
    `<body data-rp-ui-component="${escapeHtml(component.id)}">`,
    `<style>${css}</style>`,
    capturedPayload,
    `<main class="rp-shell" data-rp-ui-root="${escapeHtml(component.id)}" role="region" aria-label="${escapeHtml(component.display_name)}">`,
    `<header class="rp-head"><div class="rp-eyebrow">${escapeHtml(component.content.eyebrow)}</div><h1 class="rp-title">${escapeHtml(component.content.title)}</h1><p class="rp-subtitle">${escapeHtml(component.content.subtitle)}</p></header>`,
    `<div class="rp-state" data-rp-state hidden></div><div class="rp-body">${body}${customHtml}</div></main>`,
    `<script>${runtime}</script>`,
    "</body>",
    "```",
  ].join("\n");
}

function validateCompiledFrontend(replaceString, componentId) {
  const match = /<script>([\s\S]*)<\/script>/.exec(replaceString);
  if (!match)
    return issue(
      `/runtime/ui_experience/components/${componentId}`,
      "ui.runtime.script_missing",
      "Compiled message UI is missing its executable script",
    );
  try {
    new Script(match[1]);
    return null;
  } catch (error) {
    return issue(
      `/runtime/ui_experience/components/${componentId}`,
      "ui.runtime.script_syntax",
      `Compiled message UI JavaScript is invalid: ${error.message}`,
    );
  }
}

function triggerRegex(trigger) {
  const marker = trigger.marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return trigger.kind === "block"
    ? `/<${marker}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${marker}>/gi`
    : `/<${marker}\\s*\\/?>/gi`;
}

export function compileUiExperienceRegexes({ project, sources }) {
  const { experience, themes, bindings, components } =
    collectUiExperienceSources(sources);
  if (project?.features?.status_ui !== true || experience?.enabled !== true)
    return {
      scripts: [],
      issues: [],
      warnings: [],
      contracts: [],
      usesStatusPlaceholder: false,
    };
  const theme = themes.find(
    (candidate) => `ui_theme:${candidate.id}` === experience.theme_ref,
  );
  const bindingSet = bindings.find(
    (candidate) => `ui_bindings:${candidate.id}` === experience.bindings_ref,
  );
  const componentByRef = new Map(
    components.map((component) => [`ui_component:${component.id}`, component]),
  );
  if (!theme || !bindingSet)
    return {
      scripts: [],
      issues: [
        issue(
          "/runtime/ui_experience",
          "ui.reference",
          "UI experience is missing its theme or bindings source",
        ),
      ],
      warnings: [],
      contracts: [],
      usesStatusPlaceholder: false,
    };
  const scripts = [];
  const contracts = [];
  const issues = [];
  const warnings = [];
  const runtimePaths = new Map(
    (Array.isArray(sources?.mvu) ? sources.mvu : []).flatMap((entry) =>
      entry.value?.mvu?.enabled
        ? (entry.value.mvu.variables ?? []).map((variable) => [
            variable.source_path,
            String(variable.runtime_path ?? variable.source_path).replace(
              /^stat_data\./,
              "",
            ),
          ])
        : [],
    ),
  );
  for (const ref of experience.surfaces ?? []) {
    const component = componentByRef.get(ref);
    if (!component) continue;
    const componentBindings = (bindingSet.bindings ?? [])
      .filter(
        (binding) =>
          binding.component_ref === ref &&
          (component.binding_refs ?? []).includes(binding.id),
      )
      .map((binding) => {
        const sourcePath = String(binding.source_path).replace(
          /^stat_data\./,
          "",
        );
        const runtimePath =
          runtimePaths.get(binding.source_path) ?? sourcePath;
        return {
          ...binding,
          runtime_path: runtimePath,
          read_paths: [...new Set([runtimePath, sourcePath])],
        };
      });
    const replaceString = componentFrontend(
      component,
      componentBindings,
      theme,
      experience,
    );
    const syntaxIssue = validateCompiledFrontend(replaceString, component.id);
    if (syntaxIssue) issues.push(syntaxIssue);
    const bytes = Buffer.byteLength(replaceString, "utf8");
    if (bytes > experience.performance.max_component_bytes)
      warnings.push(
        issue(
          `/runtime/ui_experience/components/${component.id}`,
          "ui.performance",
          `Compiled component ${component.id} is ${bytes} bytes, above the component budget ${experience.performance.max_component_bytes}`,
        ),
      );
    scripts.push({
      id: stableUiRegexId(component.id),
      scriptName: `[界面]${component.display_name}`,
      findRegex: triggerRegex(component.trigger),
      replaceString,
      trimStrings: [],
      placement: [2],
      disabled: false,
      markdownOnly: true,
      promptOnly: false,
      runOnEdit: true,
      substituteRegex: 0,
      minDepth: component.delivery.min_depth,
      maxDepth: component.delivery.max_depth,
      rp_card_studio: {
        generated: true,
        kind: "ui_component",
        source_id: component.id,
        source_key: `ui_component:${component.id}`,
      },
    });
    if (component.trigger.producer === "model")
      contracts.push({
        id: component.id,
        display_name: component.display_name,
        marker: component.trigger.marker,
        kind: component.trigger.kind,
        payload_format: component.data_contract.payload_format,
        fallback: component.acceptance.fallback,
      });
  }
  const totalBytes = scripts.reduce(
    (sum, script) => sum + Buffer.byteLength(script.replaceString, "utf8"),
    0,
  );
  if (totalBytes > experience.performance.max_total_bytes)
    warnings.push(
      issue(
        "/runtime/ui_experience/performance",
        "ui.performance",
        `Compiled UI is ${totalBytes} bytes, above the total budget ${experience.performance.max_total_bytes}`,
      ),
    );
  return {
    scripts,
    issues,
    warnings,
    contracts,
    usesStatusPlaceholder: (experience.surfaces ?? []).some(
      (ref) =>
        componentByRef.get(ref)?.trigger?.marker === "StatusPlaceHolderImpl",
    ),
  };
}
