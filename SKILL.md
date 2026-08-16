---
name: rp-card-studio
description: "Explicitly invoked workflow for co-authoring and delivering complete SillyTavern RP projects as character-card JSON packages. Never invoke from natural-language topic matches alone."
---

# SillyTavern制卡工坊

Use this skill only when the user explicitly selects it or invokes `$rp-card-studio`.
Words such as “创建”, “角色卡”, “世界观”, “SillyTavern”, or “UI” are never enough.

The thing being created is a complete RP project, not necessarily one person. A
SillyTavern character-card JSON is the portable host package for that project. It may
carry world rules, one or many characters, systems, scenes, openings, CharacterBook
entries, MVU, EJS, regexes, Tavern Helper scripts, and message-contained UI.

## Personal Local Principle

This is a private, personal-use workflow. Favor creative freedom, immersion, visual
quality, useful automation, and working results. Complete HTML/CSS/JavaScript, parent
document access, browser storage, remote resources, plugin APIs, private host APIs,
and unconventional but effective techniques are allowed when they suit the project.

Do not modify SillyTavern, Tavern Helper, MVU, ST-Prompt-Template, or another plugin
to make a card work. Compatibility belongs in the card and its project sources. The
only owner-wide UI ban is a page-level persistent status panel mounted outside the
message-contained card experience.

NSFW is an authoring switch, not a runtime gate. If enabled during preflight, mature
content is fully delegated and may naturally enter the ordinary world, character,
system, narrative, and UI work. Do not ask a second boundary questionnaire and do not
project an NSFW switch, refusal rule, or safety card into the playable artifact.

## First Reply: Project Preflight Only

If the current workspace has no completed preflight record, read
[project-preflight.md](references/project-preflight.md) and ask only the missing
project-level items in one batch:

1. exact user-chosen workspace;
2. NSFW enabled or disabled;
3. operation: create, continue, convert, edit, audit, or UI-only;
4. existing material paths, or an explicit “none”;
5. which optional stages are currently planned: materials, systems, scenes, MVU/EJS,
   and status/UI;
6. extra deliverables beyond the default single character-card `.json`, if any.

Do not ask premise, world, character, system, scene, variable, prose, regex, or UI
design questions during preflight.

After the user answers all missing items, immediately create or update the lightweight
project record in the chosen workspace. Do not wait until positioning is finished:
the point of the record is to survive the conversation before large creative work
begins. For a new workspace, initialize with the chosen stage plan:

```text
init <workspace> --nsfw enabled|disabled --stages '["positioning",...,"integration"]'
```

The stage plan is navigation, not an immutable technical lock. It records what the
project currently expects so later turns do not forget optional stages. Actual stage
status remains separate. When the project changes, update the plan, report why, and
continue; do not require `--force`, fabricate a conflict, or mark future stages
`skipped` before they are actually passed.

## Sources of Truth

Keep the project understandable without this chat:

- `project.yaml`: project identity, preflight, current stage plan, materials,
  decisions, source inventory, dependencies, and deliverables;
- `.rp-card-state.json`: current stage, completed/skipped stages, summaries, build and
  validation evidence;
- `src/`: maintained RP content and actual runtime sources;
- `dist/`: generated importable artifacts only;
- `reports/`: validation evidence only.

Do not turn creative content into a computer-configuration exercise. World, character,
system, scene, and narrative sources should be readable YAML or prose designed for RP.
Machine-readable manifests are appropriate only where the host genuinely needs exact
fields: CharacterBook scheduling, regex objects, script packaging, runtime dependency
records, and artifact assembly.

## Stage Route

Use this canonical order:

1. positioning
2. materials (optional)
3. worldbuilding
4. character
5. systems (optional)
6. scenes (optional)
7. MVU/EJS (optional)
8. narrative and openings
9. status/UI (optional)
10. integration and delivery

At every transition, read the recorded plan and actual stage status. A planned stage
is entered without asking “do you still want it?” again. A planned skip is executed
when reached and receives a short reason. If new evidence changes the need, propose
and record the updated plan. Complete delegation lets the AI update it after reporting
the decision and reason.

## Per-Stage Conversation Loop

Every creative stage uses repeated rounds:

```text
multiple current-stage questions + information collection + different directions
and one reasoned recommendation
→ user choice, supplement, or explicit AI delegation
→ a merge-ready fragment
→ current-stage completeness check
→ repeat until sufficient
→ full stage summary + omission check + next-stage directions
```

Ask only questions owned by the active stage. If the user volunteers later-stage
information, preserve it in the cross-stage backlog without interrogating it early.
If the user completely delegates a choice, decide it, explain the choice once, record
it, and do not ask again.

Read [stage-engine.md](references/stage-engine.md) and
[stage-boundaries.md](references/stage-boundaries.md). Then read only the active stage
file under `references/stages/`.

## Content-First Authoring Model

Preserve the already proven worldbuilding and character approach:

- the world and NPCs exist and move without requiring a user character;
- CharacterBook carries almost everything that can sensibly be routed there;
- world material may be split into coherent entries with deliberate activation,
  position, depth, order, probability, and recursion;
- each NPC remains a continuous readable definition rather than being shattered into
  tiny database fields;
- card-front `description` is the project entrance/core contract, never an NPC sheet;
- large-world cards use the project title, while true single-character cards may use
  the sole character name.

Do not force systems, scenes, narrative, variables, or UI into generic product schemas.
Their source form must match what is actually authored and eventually packed.

## Direct Runtime Authoring

For MVU, EJS, regex, scripts, and UI, author the real component that will run. Do not
invent an abstract adapter and later pretend it is equivalent.

### MVU and EJS

Read [mvu-ejs.md](references/stages/mvu-ejs.md).

An MVU implementation is a closed chain: framework loading, actual initial data, the selected native/MVU_ZOD/hybrid/existing schema route, model-visible update rules, output format, per-opening initialization, prompt routing, and UI readers. `stat_data` is the primary game-state tree unless the target project proves another shape. For every new MVU route, maintain a real initial-values file and project it through `worldbook_manifest.entries` as a CharacterBook entry whose name contains `[initvar]`. MVU_ZOD registers project structure; it does not replace initial data. Treat opening `<initvar>` as an override after lorebook initialization, never as a standalone bootstrap when no primary lorebook is installed and linked. Never confuse the project schema script with the MVU framework loader. Preserve real Tavern Helper Script/ScriptFolder trees.

EJS is actual ST-Prompt-Template source. It may project a compressed MVU context,
choose text, or route prompt content, but it is not a generic condition table and it
does not replace MVU storage. Keep `.ejs` source intact and package it into the exact
CharacterBook entry or host surface that owns it.

Do not add a second synthetic runtime layer, fake event system, or invented API when the selected MVU/Tavern Helper/ST-Prompt-Template stack already owns that behavior. Verify exact symbols against the target runtime before writing version-sensitive code.

### Regex

Read [regex-and-rendering.md](references/regex-and-rendering.md).

Maintain actual card regex objects with Chinese `scriptName` values and stable IDs.
Derive each rule from its real source text and destination:

- display replacement for opening/status/event HTML;
- display-only hiding of raw variable or protocol blocks;
- prompt-only removal or retention by floor depth;
- streaming/incomplete-block handling when required;
- edit/swipe/reload behavior;
- ordered multi-rule transformations only when one rule truly produces the next
  rule's input.

Test the exact raw, streaming, complete, edit, and depth fixtures. Offline replacement
does not prove the installed host's render order.

### Opening Experience UI

Read [narrative-opening.md](references/stages/narrative-opening.md).

The required narrative/opening stage owns the first-message introduction and creation
frontend as `opening_ui`: version and world introduction, updates, author notes, play
guide, route selection, character creation, preview, and confirmation into a real user
message. Its source, marker, prompt fallback, lifecycle, and visual/interaction level
are decided independently from the ongoing status UI.

### Ongoing Message UI

Read [status-ui.md](references/stages/status-ui.md).

This optional stage owns only the ongoing in-RP message interface after entry: status,
inventory, relationships, tasks, clues, maps, checks, notifications, and host-linked
actions. Never place the first-message introduction, route-selection, or character-
creation frontend in `status_ui.surfaces`; that belongs to `opening_ui` in the previous
required stage. Keep one coherent ongoing surface together instead of scattering every
small widget into a separate regex and generic component template.

The maintained source may be one complete `.html` file or a small source project that
builds one complete replacement HTML. The final regex `replaceString` must contain or
load the actual complete result. Do not use the generic `ui.yaml` component compiler
as the default authoring route.

Regex replacement is common, not exclusive. A surface may instead be rendered by a
Tavern Helper script, EJS, inline message HTML, a verified framework, or an existing
card route. Validate the route actually chosen; never force a working project through
regex replacement merely because it is the default example.

UI scale (`light`, `light_medium`, `medium`, `heavy`, `super_heavy`) measures visual
finish, thematic integration, interaction richness, JavaScript sophistication,
convenience, fun, and runtime depth—not a line-count quota or a mandatory number of
pages. Design from the Chinese player's actual reading and interaction experience:
localized labels, intentional hierarchy, good CJK typography, useful density,
responsive layout, visible feedback, touch targets, focus, empty/error/loading states,
and lifecycle-safe host actions.

Treat the complete ongoing HTML represented by the project's `我，非我.html` reference
as the `light` experience floor: a coherent multi-view status application with real data
binding, internal navigation, information tools such as search/filter/detail, at least
one real host-linked action, feedback and fallback states, responsive behavior, and a
finished project-specific theme. Do not reduce `light` to a small static dashboard. Do
not enforce the reference file's byte or line count; use
`status_ui.experience_evidence` as a review note rather than a numeric gate. Every level above `light` should name genuine additions
in functionality, interaction, convenience, visual performance, host integration, or
lifecycle depth. `super_heavy` additionally makes the message application the primary
play surface.

### Integration

Read [integration.md](references/stages/integration.md).

Integration cuts the confirmed RP YAML/prose into non-empty CharacterBook entries and packs the already-authored runtime components. It does not rewrite them through a second generic framework. Preserve actual JS/EJS/HTML/regex source bytes except for declared file materialization and unavoidable JSON escaping.

Keep four separate facts explicit: the card contains a non-empty `data.character_book`; `data.extensions.world` names that book; SillyTavern has imported the embedded book into its world-info list; and the character's current primary lorebook is linked to it. A standard card JSON can declare the first two but cannot prove the host has completed the latter two. During real-host acceptance, use SillyTavern's “Import Card Lore” flow and verify the live primary-world selection. If the project explicitly needs zero-click installation, author and version-test a project-specific Tavern Helper automation against the real host API; do not modify SillyTavern itself or assume one universal helper works everywhere.

## Card Projection

For new projects:

- `data.name`: project title for world/gameplay/ensemble projects; sole character name
  only for a true single-character project;
- `data.description`: readable project entrance/core contract, not an NPC profile;
- `data.first_mes` and `alternate_greetings`: actual opening messages or short stable
  UI markers with a separately tested prompt-visible fallback;
- `data.character_book`: non-empty primary container for modular world, NPC, system, scene, narrative, MVU/EJS, output, and integration entries;
- `data.extensions.world`: exact name of the embedded CharacterBook that the character should use after the host imports it;
- `data.extensions.regex_scripts`: authored card regexes;
- `data.extensions.tavern_helper`: authored Tavern Helper scripts and related data.

Advanced-definition fields are valid host slots but are not the default home for
world, NPC, system, scene, or runtime content. Use them only when a specific host
behavior or compact always-on contract benefits.

## Forge Role

Forge is a faithful local packer and validator. It may:

- initialize and resume the project record;
- read maintained sources;
- split and schedule CharacterBook entries;
- materialize file-backed regex replacement strings and helper scripts;
- assemble JSON/PNG when requested;
- preserve imported unknown fields;
- validate syntax, references, formats, and round trips.

The skill and executing model actively author project-specific RP, MVU, EJS, regex,
scripts, and complete frontends. Forge then preserves, assembles, and validates those
sources. Forge itself must not silently replace authored work with generic facts,
variable paths, runtime layers, fixed regex suites, UI components, or generic HTML.

Validation follows lifecycle. Missing pieces in a `draft` source are pending work and
normally produce warnings. The same missing load-bearing pieces become blocking when
the stage is `locked` or the final artifact claims that route is complete. Confirmed
syntax corruption, destructive overwrite, identifier collisions, and data loss remain
errors at every stage.

A technical test card may reduce story volume, UI richness, cast size, or visual polish, but it must not omit any load-bearing component of the route being tested. If a chat-message variable protocol emits a technical update block, its completed and still-streaming forms need a verified player-display cleanup path. Card regex is the default; framework cleanup, host regex, or an existing mechanism is valid only when the project records that choice and its evidence.

Every message-contained UI marker also needs a real producer. An opening marker may come from the opening message. A marker or XML status block expected on every assistant reply defaults to a dedicated, constant, model-visible CharacterBook output-contract entry that explicitly commands the same marker and cadence. Framework, helper-script, user-action, and existing producers are valid when recorded with evidence. HTML plus a consuming regex is not a closed runtime path by itself; this applies equally to MVU-backed short markers and non-MVU XML status blocks.

Default final delivery is exactly one character-card `.json`. Mention PNG and other
artifacts as optional; generate them only when explicitly requested.

## Evidence and Handoff

Separate source/static, assembled-artifact, real-SillyTavern, and user-acceptance
evidence. No real-host run means `runtime: not_run`, not failure and not proof.

For runtime work, verify the imported artifact, embedded CharacterBook import, live primary-lorebook link, enabled scoped regex/scripts, Blob URL setting when relevant, first chat, raw message data, final DOM/iframe, current message-floor state, interactions, edit/swipe/reload/chat-switch lifecycle, narrow screens, long Chinese text, and console errors. Never report MVU initialization as passed merely because the loader or `window.Mvu` exists; confirm that `stat_data` contains the expected initial values.

Return the project summary, files changed, decisions, dependency/install notice,
validation evidence, unresolved host checks, and the next recommended stage or action.
