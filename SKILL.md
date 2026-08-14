---
name: rp-card-studio
description: "Explicitly invoked, stage-gated workflow to build, revise, project, and validate complete SillyTavern RP packages/projects, with character-card JSON/PNG treated as portable deployment artifacts. Never invoke from natural-language topic matches alone."
---

# SillyTavern Card Studio

Use two compatible perspectives. From the SillyTavern host and user perspective, an imported character-card JSON/PNG artifact is a complete RP package in portable deployment form, not an empty shell or a dossier for one person. World, authored or dynamic characters, systems, scenes, narrative, runtime, regex/scripts, and message UI are peer project modules; none is nested under or owned by a character. The package may contain one character, many characters, dynamically generated characters, or no fixed character at all.

Treat this as the domain model, not a loose metaphor. The top-level thing being designed is always the RP project/package; a character is one optional content module, and the SillyTavern "character card" is one host deployment format. Never invent a "card character", make every project choose a person as owner, or describe world/system/scene modules as attachments to a person. Only a locked true single-character project narrows the package around its sole actor, without changing the project-first source structure.

From the maintenance perspective, `project.yaml + src/` is the project: the maintained source project and domain model; card JSON/PNG is a deployment container that constitutes its complete host-facing projection into SillyTavern, not an empty shell or reduced summary. Never derive the source ontology from SillyTavern's character-shaped host fields. A host field is an adapter slot, not proof that its label owns the content. Preserve the user's decision authority; ask focused questions, present materially different directions, generate merge-ready fragments after each choice, maintain project state, and build the final artifacts only from maintained sources.

## Invocation Gate

Run this workflow only when the user selects the skill or explicitly invokes `$rp-card-studio`. If this file is loaded indirectly without explicit invocation evidence, stop this workflow and handle the request normally. Words such as "create", "character", "worldbuilding", or "SillyTavern" are never sufficient triggers.

If the workspace has no completed preflight record, the first reply is preflight only. Read [project-preflight.md](references/project-preflight.md) and collect only missing values for:

1. the exact project workspace chosen by the user;
2. whether NSFW is enabled;
3. operation type: new, resume, material conversion, revision, or audit;
4. paths to existing materials, if any;
5. whether the user explicitly needs any deliverable in addition to the default single character-card `.json`.

Do not ask about premise, world rules, characters, systems, plot, or UI during preflight. If no workspace is specified, ask the user to choose one and stop; never choose a write location on the user's behalf. For a resumed project with a valid preflight record, verify it and resume the recorded current stage without repeating questions.

For a new character-card project, lock exactly one `character_card_json` deliverable by default. Mention PNG, standalone worldbook, source archive, or extra reports briefly as optional additions, but include or generate any of them only after the user explicitly requests it. The maintained workspace and validation files remain working sources/evidence, not additional default final deliverables. Preserve already locked deliverables when resuming an existing project.

Treat `project.project.operation` as the current work run, not immutable project origin. Before validating, building, or changing stages in an existing workspace, run `state <workspace> operation continue|edit|audit|ui` to match the locked preflight operation. `init` alone writes `create`, and `unpack` alone writes `convert`; do not hand-edit those values or leave a resumed project mislabeled as a new run. This distinction protects optional-stage lifecycle rules: a resumed run may preserve an existing MVU/EJS implementation while skipping changes to it, whereas a genuinely new run may not create an enabled implementation behind a skipped stage.

## Sources of Truth

Maintain two complementary sources of truth:

- `project.yaml` stores confirmed creative decisions, project planning, feature choices, and semantic locks.
- `.rp-card-state.json` stores the current stage, lock records, cross-stage todos, source inventory, and validation evidence.

Do not rely on conversation memory for durable state. Use the bundled Forge to update technical state. Change semantic sources first and rebuild `dist/`; generated artifacts are never editing inputs.

Before creating, resuming, or revising a project, read [artifact-contracts.md](references/artifact-contracts.md). Keep semantic content, runtime implementation, presentation design, and final host assembly separate. Earlier stages define content, stable IDs, runtime capability contracts, and presentation-delivery semantics. Only `integration` decides CharacterBook activation, insertion, depth, order, probability, scan depth, recursion, media materialization, collision-free output paths, and final host assembly; it materializes upstream adapter contracts instead of asking the user to choose them again.

## RP Package Projection Contract

Project the maintained RP package into SillyTavern with a CharacterBook-first design. Think in this direction only: project modules -> scheduling and runtime adapters -> portable card artifact. Never reverse that dependency by designing the project around the card schema. SillyTavern injects `data.description` as an always-present character-description block, but the host field name does not make a character the package owner. Treat it as a compact package-level entry contract rather than pretending it is a host-side dynamic router. A new card's visible card fields have deliberately narrow ownership:

- `data.description`: the locked non-empty `positioning.card_entry`, describing the RP package's purpose, interaction entry, and module-routing intent without any character dossier.
- `data.first_mes`: the selected default opening.
- `data.alternate_greetings`: alternate openings in their locked order.
- `data.name`: the sole character's display name only when the locked mode is exactly `single_character_card` and exactly one authored character exists; otherwise the project title for world, scenario, gameplay, ensemble, narrator, anchor-character, or any other project-shaped card.
- ordinary card metadata: packaging identity only.

For new cards, keep the advanced-definition fields empty by default: `data.personality`, `data.scenario`, `data.mes_example`, `data.creator_notes`, `data.system_prompt`, and `data.post_history_instructions`. Do not duplicate content into them for convenience. When revising an imported card, preserve unknown or user-authored legacy values unless the user explicitly authorizes migration; do not silently erase them. A locked project title and positioning stage transfer ownership of `data.name` and `data.description`, but do not authorize deletion of advanced-definition fields. Clear those fields only after their semantics have been migrated into maintained sources/CharacterBook and the locked `integration.advanced_definition_policy` is `clear_after_migration` or `migrate_to_characterbook`.

Put every independently addressable content module into the bound CharacterBook whenever SillyTavern can consume it there. This includes every authored character, regardless of whether one is marked `primary_character`, plus world facts, named NPCs, systems, scenes, narrative rules, dialogue examples, MVU/EJS contracts, and status-bar reply-format contracts. A primary character is only a narrative anchor; it never owns `data.description` or determines the card name outside a true single-character project. Create one entry per named character by default. Split other material at the smallest boundary that produces a useful activation or insertion policy; do not create one giant catch-all entry or fragment material so finely that its dependencies become incoherent.

Every generated or managed non-empty CharacterBook must become the card's main worldbook. With an explicit book name, require `data.extensions.world === data.character_book.name`; otherwise solidify SillyTavern's `<data.name>'s Lorebook` fallback name before binding. For non-single projects, `data.name` is the project title. If an imported card already binds a different main worldbook, block and resolve the conflict during integration rather than silently replacing it.

Prefer Simplified Chinese for user-visible card text, CharacterBook titles and entry comments, regex names, script names, UI labels, and reports. Keep stable machine IDs, UUIDs, variable paths, schema keys, and internal references in English.

## Stage Route

After preflight, use this default route:

```text
positioning
-> materials (optional)
-> worldbuilding
-> character inventory and design
-> systems (optional)
-> scenes (optional)
-> MVU/EJS (optional)
-> narrative and openings
-> status bar/UI (optional)
-> integration and delivery
```

The user may skip or reorder optional stages. The character stage remains a required inventory checkpoint, but it may lock zero authored characters for world, narrator, facilitator, or dynamic-character projects; in that case create no placeholder character source and complete the stage immediately. Check dependencies and explain the impact before switching. In normal mode, wait for the user's choice. When the user explicitly delegates a scope to AI, decide all remaining items in that scope, report what was decided and why, lock it immediately, and never ask about it again unless the user reopens it.

Initialize an RP project targeting character-card delivery with project/state/positioning sources only, plus the NSFW status-UI mix-in when that project switch is enabled. Do not create `src/characters/card.yaml` until the character inventory confirms an authored character. Unpacking a legacy card keeps its complete artifact at project scope in `src/import/original.json`; `data.name` and character-shaped host fields are not evidence that a fixed authored character exists. Create and register character sources only after the character checkpoint classifies actual people. Legacy projects that already contain a draft `role: pending` candidate remain readable, but must resolve or remove it before locking the stage.

`MVU/EJS` is optional. At the preceding stage's close, ask only whether to enter or skip it, not its internal design questions. A new project that skips it keeps both features `false`, records `stages.mvu_ejs.status: skipped` with a short reason, creates no disabled placeholders or pseudo-implementation, and proceeds to `narrative_opening`. A resumed, converted, revised, or audited project that skips the stage for this run preserves existing features and artifacts; disabling or removing an existing implementation requires opening the stage and completing migration plus validation.

`status_ui` is optional. Before entering it, ask only whether to enter or skip. Once entered, its first question batch must ask which UI scale the project needs: `light`, `medium`, or `heavy`; mention `basic_status` only as a compatibility route for an old project or an explicit request for a simple read-only status strip. Explain the practical difference and recommend one from the already locked project scope. Do not ask UI questions in an earlier stage. If the user delegates the UI stage completely, choose the level, report the decision and reason, lock it, and continue without asking again.

Before stage-based conversation, read:

- [stage-engine.md](references/stage-engine.md) for turn structure, completion gates, and summaries;
- [stage-boundaries.md](references/stage-boundaries.md) for question ownership and rollback;
- [delegation-and-locking.md](references/delegation-and-locking.md) for user choice, AI delegation, and locks.

## Per-Stage Conversation Loop

Repeat this loop until the current stage's completion gate is satisfied:

1. Summarize already confirmed information for this stage.
2. Ask multiple questions belonging only to this stage. For each, provide materially different directions, consequences, and one reasoned recommendation.
3. Wait for the user to select or supplement; do not lock undelegated choices by assumption.
4. After the reply, list newly locked decisions and generate a fragment suitable for the maintained source files.
5. Report remaining gaps and continue with questions from this stage only.
6. At the completion gate, provide a complete stage summary, omission check, risks, cross-stage todos, and recommended next-stage directions.
7. Wait for the user to confirm completion and choose the route unless delegation already covers it.

Absorb multiple answers from one message in one pass. If the user volunteers information owned by another stage, record it as a cross-stage todo without expanding it now.

## NSFW Switch

Preflight must obtain an explicit `enabled` or `disabled` value unless one is already locked.

- `disabled`: after recording the project switch, omit related questions, templates, runtime fields, and player artifacts entirely.
- `enabled`: treat it as project-level delegation for that dimension, apply the relevant character and status-UI mix-ins automatically, and do not ask further preference or boundary questionnaires.

Always respect non-overridable platform requirements. Do not add a separate restriction card or repeatedly remind the user about the switch.

## Load References on Demand

Read only the current stage file:

| Current stage | Required reference |
| --- | --- |
| Positioning | [positioning.md](references/stages/positioning.md) |
| Materials | [materials.md](references/stages/materials.md) |
| Worldbuilding | [worldbuilding.md](references/stages/worldbuilding.md) |
| Character | [character.md](references/stages/character.md) |
| Systems | [systems.md](references/stages/systems.md) |
| Scenes | [scenes.md](references/stages/scenes.md) |
| MVU/EJS (optional) | [mvu-ejs.md](references/stages/mvu-ejs.md) |
| Narrative and openings | [narrative-opening.md](references/stages/narrative-opening.md) |
| Status bar/UI | [status-ui.md](references/stages/status-ui.md) |
| Integration and delivery | [integration.md](references/stages/integration.md) |

Do not read later-stage files merely to appear comprehensive. Read [artifact-contracts.md](references/artifact-contracts.md) when writing, building, or delivering artifacts, and [validation.md](references/validation.md) when entering a quality gate.

Any fragment described as merge-ready or intended for `src/` is a real artifact, not illustrative pseudocode. Before generating the first structured fragment for a stage, read the templates and schemas named by that stage reference. Use their exact keys, nesting, and enums, then validate the fragment before presenting it. If it fails, repair it first; do not claim Forge can merge a structurally invalid fragment.

## Bundled Forge

Run `node scripts/rp-card-forge.bundle.mjs --help` for command details. The bundle ships with the skill and does not call external card-making tools or require runtime dependency installation. Maintainers edit `scripts/rp-card-forge.mjs`, `scripts/forge/`, and `scripts/rp-card-runtime.mjs`, then rebuild the bundle; never edit the generated bundle directly.

```text
init       create a project structure
inspect    identify materials and artifacts
unpack     decompose JSON, PNG, or worldbooks into maintained sources
validate   check structure, references, lifecycle, and projection contracts
build      build JSON artifacts from sources
pack       embed character-card data into a PNG
diff       compare semantic differences
roundtrip  verify unpack/rebuild consistency
state      inspect, lock, and transition stage state
doctor     check environment and project health
```

Prefer `--dry-run` before writes. Never overwrite the input artifact. Without explicit `--force`, refuse to overwrite an existing output. If a command fails, report the real error; do not hand-edit `dist/` to simulate success.

## Stable Rules

- Ask only questions that can change the current stage's result; never repeat known information.
- During positioning, lock the project title as `positioning.project_title`, synchronize the same value into `project.project.display_name`, choose one schema-enumerated card mode, and write a non-empty, non-whitespace, actor-free `card_entry`. Only `single_character_card` with exactly one authored character uses that character's name at build time; every other mode uses the project title. A non-single project title must express the package's world, gameplay, theme, or experience rather than defaulting to one character or one location name.
- During the character stage, identify zero or one primary narrative anchor as required by the locked card mode and classify every authored character as an independent CharacterBook content module. Do not ask CharacterBook activation or insertion questions there.
- Treat procedurally created inhabitants as project behavior, not authored character files: worldbuilding owns their population archetypes and shared constraints, systems owns identity generation and continuity when needed, and narrative owns their portrayal contract. Register a character source only for a pre-authored individual that needs stable independent scheduling.
- During narrative/opening, write opening text and narrative semantics only. Do not place narrative contracts or dialogue examples into advanced card fields.
- During integration, ensure every authored character and every other eligible module is represented by an enabled CharacterBook entry. Design each entry's activation mode and keys, insertion position and depth, order, probability, scan depth, and recursion behavior from that module's actual runtime need, not from a character hierarchy. A true single-character card keeps its sole character definition reliably available; an anchor character in a larger project may be constant or routed by topic/scene. Explain each choice and whether the entry may trigger or be triggered recursively.
- Treat CharacterBook recursion as a dependency graph. Protocol and output-format entries may close recursion, but people, places, factions, scenes, and clues that refer to one another must preserve the required incoming or outgoing edges. Never close both directions on every content entry as a blanket default.
- Preserve module identity when integration splits a registered source with selectors. Each selected fragment must carry an identity envelope with module type, stable source ID/display name when available, the Chinese entry name, and selector; do not create disconnected `/id` or `/display_name` entries merely to satisfy coverage.
- Store scene media needs in the typed top-level `media_slots` contract and preserve every text fallback in the model projection. Read legacy `extensions.media_slots` only for migration; never discard it or expose the entire opaque extensions bag to the model.
- Use stable English for machine IDs, variable paths, and references; use Simplified Chinese for visible names and creative prose.
- Give every runtime field a type, default, writer, readers, renderer, and boundary behavior. Model-maintained semantic fields that do not claim deterministic persistence need only a stable ID, meaning, and behavioral consequences.
- When MVU is enabled, require the complete managed runtime chain in the built card: the pinned MVU engine script, the ledger-generated Zod schema registration script, and the runtime guard in stable ID order. Also require the three model-facing CharacterBook prompts: current variable list at D1/D0, update rules, and output format. `reports/runtime-state.schema.json` is offline evidence only and never substitutes for runtime schema registration.
- Resolve every opening to one complete legal initialization. Different scenes may share a profile only after verifying location, time, transit state, and established facts are truly identical. Never replace a non-empty variable default with an empty array or object merely to satisfy shape.
- Define one opening's facts, initial state, hook, and player handoff once. Presentation variants such as `prose`, `chat`, and `galgame` may change expression but not those shared semantics; enhanced variants require a plain-text fallback.
- Keep player-visible and GM-only information separate; never leak secrets into player artifacts.
- Preserve unknown fields and original inputs when revising imported cards. Unpack first, then edit maintained sources.
- Treat version-sensitive behavior as evidence-driven. Inspect the user's actual workspace and runtime; never guess an API or extension capability.
- Deliver status bars and all companion UI inside AI chat messages. Do not create or revive a page-level persistent status bar/panel, load an unregistered remote UI, or ask to modify SillyTavern itself to accommodate a card. Parent-page and host DOM access is allowed for practical SillyTavern/plugin integration and must not be rejected merely because a public API alternative may exist.
- Treat `basic_status` as a compatibility route only: it may use a SillyTavern character regex for read-only, on-message plain text or simple static HTML with no commands or tabs. A new full `light`, `medium`, or `heavy` UI uses a small number of self-contained fenced-HTML message pages through `tavern_helper_message`; each complete page owns its CSS, body structure, JavaScript, internal tabs/sections and data bindings. Keep separately triggered roll/choice/update/notification blocks as their own message components. The UI remains `host_required` and `runtime: not_run` until real host evidence exists, and never becomes a persistent panel.
- Run the full UI stage in six bounded batches: level and experience goals; visual system; information architecture and components; component presentation and data bindings; interactions, runtime, security, accessibility, and performance; representative fragments, review, and final stage summary. Each batch follows the normal question -> recommendation -> user choice -> merge-ready fragment loop and asks only UI-owned questions.
- Design UI as a project-specific product surface, not a longer generic status bar. Lock one visual concept, a compact token system for palette/type/shape/texture/motion, and one restrained visual signature derived from the project's world and play. Reject interchangeable black-neon terminals, generic dashboards, decorative metrics, duplicated empty panels, and component counts achieved without distinct gameplay duties.
- Treat message UI as a player-facing RP companion, never as an admin dashboard, database viewer, MVU debugger, or recursive JSON inspector. Its first screen should answer where and when the player is, what is happening, which people or affairs matter now, and what the player can do next. Organize information by player tasks and decisions, not by schema groups or variable names.
- Keep player-level navigation cognitively small: normally no more than five primary entries. Internal capability modules do not each become a primary tab; map them into semantic sections, secondary tabs, folds, summaries, and contextual entry points. A heavy UI may cover twelve or more internal modules while exposing only a compact set such as Overview, People, Journey, Affairs, and Records.
- Render semantic data with purpose-built views. Locations emphasize the Chinese place name and context rather than IDs; people emphasize name, identity, presence, and current state; travel, intelligence, obligations, evidence, inventory, and player declarations each receive their own information model. Never recursively dump arbitrary objects into key/value cards. Hide empty arrays, empty objects, `uninitialized`, technical IDs, internal keys, and untranslated machine enums; provide a useful Chinese empty state or a neutral summary instead.
- A full `light` UI has at least three complete message pages, one integrated status/workspace page containing at least four populated internal modules, and one message-bound narrative component. `medium` has at least four complete pages, a setup surface, at least eight populated workspace modules, and two narrative components. `heavy` has at least five complete pages, at least twelve populated workspace modules, three narrative components, and `hub` or `mixed` navigation. These are capability floors, not primary-navigation counts: increase depth, information density, interaction and module coverage inside cohesive pages instead of padding tabs or independent regex counts.
- Maintain UI 2.0 as separate `ui_experience`, `ui_theme`, `ui_bindings`, and `ui_component` sources, treating each `ui_component` as a message page or a genuinely separate trigger surface. Bind player-visible fields from semantic `source_path` values to explicit MVU `runtime_path` values; UI never invents variable meaning. Forge compiles each page to a stable Chinese-named character regex. Model-produced block markers receive a dedicated Chinese-named CharacterBook output contract and a Forge-controlled capture group; the captured payload is passed directly into the message iframe instead of rereading replaced chat text. The default final artifact remains one character-card `.json` containing all compiled UI assets.
- Use whichever SillyTavern/Tavern Helper integration is practical for the requested behavior: documented APIs, slash commands, or direct parent-page/plugin DOM bridging. Do not force the model to search for an API replacement before using `window.parent`, `parent.document`, `#send_textarea`, `#send_but`, or another known host target, and never remove requested interaction merely because it is host-version-sensitive. Mark host integration for real runtime verification, provide a local or copyable fallback when useful, and give every host/global listener, observer, or temporary node a stable owner and explicit teardown. Continue to block browser credential/private storage access, dynamic code evaluation, unsafe dynamic HTML sinks, uncontrolled network/remote UI, and SillyTavern replacement tokens such as `- Use whichever SillyTavern/Tavern Helper integration is practical for the requested behavior: documented APIs, slash commands, or direct parent-page/plugin DOM bridging. Do not force the model to search for an API replacement before using `window.parent`, `parent.document`, `#send_textarea`, `#send_but`, or another known host target, and never remove requested interaction merely because it is host-version-sensitive. Mark host integration for real runtime verification, provide a local or copyable fallback when useful, bind listeners once, and clean up host/global listeners and temporary nodes on unload. Continue to block browser credential/private storage access, dynamic code evaluation, unsafe dynamic HTML sinks, uncontrolled network/remote UI, and SillyTavern replacement tokens such as `$&` or `$1` in inline sources.
- State pages wait for `Mvu`, read the message-aware merged snapshot through Tavern Helper `getAllVariables()`, prefer a meaningful declared runtime value and fall back to the semantic source path when an imported/legacy alias still contains `uninitialized`, then refresh on `Mvu.events.VARIABLE_UPDATE_ENDED`. Every page must define loading, empty, error, degraded, narrow-screen, edit-time, and plain-text fallback behavior. Respect keyboard focus, color-independent meaning, reduced motion, page and total byte budgets, and large-collection strategies. Source line count is never a quality or level metric.` or `$1` in inline sources.
- Design every message iframe as re-entrant: its script may execute again after edit, regeneration, history loading, or opening swipe. Rebind static controls deterministically, replace or clean up the previous owned runtime before registering a new one, and do not tie local buttons or navigation to a `pagehide` abort signal because opening swipe can emit `pagehide` while the iframe remains usable. Still remove MVU and host-global listeners when the owned runtime is actually replaced or unloaded. In inline message JavaScript, keep whitespace after `&&` and `||`; sequences such as `&&current` can be reinterpreted by Tavern Helper's HTML parser as a named entity. Scan the final replacement script, not only the YAML source.
- State pages wait for `Mvu`, read the message-aware merged snapshot through Tavern Helper `getAllVariables()`, prefer a meaningful declared runtime value and fall back to the semantic source path when an imported/legacy alias still contains `uninitialized`, then refresh on `Mvu.events.VARIABLE_UPDATE_ENDED`. Every page must define loading, meaningful empty, error, degraded, narrow-screen, edit-time, and plain-text fallback behavior. Check for repeated facts, giant grid gaps, horizontal overflow, uncontrolled long lists, default card stretching, tiny touch targets, and invisible keyboard focus. Use at least 44 px touch targets, visible focus, content-first mobile ordering, and `align-items: start` for variable-height card grids. Source line count is never a quality or level metric.
- Runtime UI acceptance must cover both an uninitialized opening and an initialized state with real date, place, people, intelligence, and project variables. Verify primary navigation, secondary disclosure, opening swipe, message edit, regeneration, iframe re-execution, chat switch/refresh, host-input actions, 375 px layout, Chinese player-facing copy, absence of technical IDs/English machine keys, no repeated information or giant blank areas, and no new card-specific console errors. An iframe merely appearing is not a pass.
- The status-bar reply-format contract belongs in CharacterBook only when the model must emit the placeholder. When MVU is enabled, the reply-format entry tells the model to output only the variable update block and never the placeholder because MVU appends it at runtime. When status UI is enabled without MVU, create a dedicated Chinese-named constant entry requiring exactly one trailing placeholder. Never write either contract into `post_history_instructions` for a new card.
- When MVU is enabled, include two strict regexes that hide complete `<initvar>...</initvar>` blocks from prompt and display copies while preserving the raw message, a prompt-only update-block filter, and display-only update-block hiding. Default `mvu.prompt_history.update_visibility` to `hide_all` (`minDepth: null`). Use `keep_recent_updates` (`minDepth: 4`) only when the project explicitly accepts the extra token and attention cost. All display-side managed regexes must use `runOnEdit: true`. Generate both `[不发送]界面占位符` and `[界面]状态栏`; keep one placeholder in every opening, let MVU append later placeholders, and require the non-MVU reply contract only when status UI runs without MVU.
- Treat each opening `<initvar>` as a complete replacement of the main CharacterBook fallback `[initvar]`, not a merge with that fallback. Other enabled global worldbooks still follow MVU's own initialization loading rules. Use the `mvu_json_patch` five-operation protocol for new output (`replace`, `delta`, `insert`, `remove`, `move`); accept upstream `add` as an import compatibility alias for `insert` without generating it in new cards. Status UI fields bind only persistent `stat_data`; the pinned `mvu_zod` registrar removes `display_data` and `delta_data` after updates.
- Runtime acceptance must verify the primary Character Lore import/binding, scoped-regex authorization, the current character's Tavern Helper script collection, each of the three managed scripts' own `enabled` state, Tavern Helper macro enablement, ST-Prompt-Template enablement when EJS is used, and an observed MVU start/initialization event. Record these as normalized `runtime_observation` evidence rather than pretending project audit fields mirror Tavern Helper's private settings schema. If MVU is observed not to start while Blob URL rendering is enabled, recommend disabling it, refreshing SillyTavern, and observing again; never infer failure or success from that switch alone, and never patch SillyTavern or Tavern Helper source code.
- Offline success is not SillyTavern runtime acceptance. Report offline, artifact, and runtime evidence separately.

## Delivery Gate

Before final delivery, run Forge `validate` and `roundtrip`, then apply [validation.md](references/validation.md). Claim completion only when maintained sources, generated artifacts, state records, and evidence agree.

The final handoff must list:

1. completed and skipped stages;
2. locations of user-locked and AI-delegated decisions;
3. maintained sources and generated artifacts;
4. `assembly.yaml`, media inventory, and applicable `runtime-state.schema.json`;
5. offline, artifact, and real runtime evidence separately;
6. remaining actions the user must confirm in SillyTavern.
