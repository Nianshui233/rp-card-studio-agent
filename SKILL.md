---
name: rp-card-studio
description: "Explicitly invoked, stage-gated workflow to build, revise, project, and validate complete SillyTavern RP packages/projects, with character-card JSON/PNG treated as portable deployment artifacts. Never invoke from natural-language topic matches alone."
---

# SillyTavern Card Studio

Use two compatible perspectives. From the SillyTavern host and user perspective, an imported character-card JSON/PNG artifact is a complete RP package in portable deployment form, not an empty shell or a dossier for one person. World, authored or dynamic characters, systems, scenes, narrative, runtime, regex/scripts, and message UI are peer project modules; none is nested under or owned by a character. The package may contain one character, many characters, dynamically generated characters, or no fixed character at all.

Treat this as the domain model, not a loose metaphor. The top-level thing being designed is always the RP project/package; a character is one optional content module, and the SillyTavern "character card" is one host deployment format. Never invent a "card character", make every project choose a person as owner, or describe world/system/scene modules as attachments to a person. Only a locked true single-character project narrows the package around its sole actor, without changing the project-first source structure.

From the maintenance perspective, `project.yaml + src/` is the project: the maintained source project and domain model; card JSON/PNG is a deployment container that constitutes its complete host-facing projection into SillyTavern, not an empty shell or reduced summary. Never derive the source ontology from SillyTavern's character-shaped host fields. A host field is an adapter slot, not proof that its label owns the content. Preserve the user's decision authority; ask focused questions, present materially different directions, generate merge-ready fragments after each choice, maintain project state, and build the final artifacts only from maintained sources.

## Personal Local Operating Principle

This skill serves one owner building private, local, non-commercial SillyTavern projects. Default to creative and technical freedom: maximize enjoyment, aesthetics, immersion, functionality, and practical results. The user accepts the consequences of dependencies, version coupling, remote resources, unconventional APIs, and maintenance choices. Do not apply a public-release, commercial-product, multi-tenant, or hostile-input threat model unless the user explicitly changes the distribution goal.

All implementation techniques are allowed by default, including complete HTML/CSS/JavaScript, large pages, inline handlers, trusted HTML templates, browser storage, network requests, WebSocket, remote fonts/scripts/media, parent-page DOM, plugin internals, private host APIs, advanced card fields, and custom adapters. Choose them by usefulness and whether they work, not by whether they would pass a public product security review. Implement first, then report dependencies, version sensitivity, portability, and known consequences without turning those consequences into permission gates.

Hard blockers are limited to: non-overridable platform constraints; unapproved destructive changes to user data; the user's explicit bans on modifying SillyTavern/plugin source and creating page-level persistent status panels; and defects that demonstrably make the artifact malformed, references unresolved, data lost, or required behavior nonfunctional. Missing real-host evidence limits only the claim of runtime success; it never blocks design, implementation, candidate builds, or delivery marked `runtime: not_run`.

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

Project the maintained RP package into SillyTavern with a CharacterBook-first preference, not CharacterBook exclusivity. Choose the host slot that makes each module work best: card entry, greeting, CharacterBook, advanced definition, regex, Tavern Helper script, EJS, MVU, message HTML, plugin configuration, local resource, or another registered adapter. Every maintained source needs a deliberate projection disposition so content is not lost or pointlessly duplicated. Never reverse the domain model by making a character-shaped host field the owner of the RP project. SillyTavern injects `data.description` as an always-present block, so keep it as the compact package-level entry rather than a character dossier. A new card's visible card fields normally follow:

- `data.description`: the locked non-empty `positioning.card_entry`, describing the RP package's purpose, interaction entry, and module-routing intent without any character dossier.
- `data.first_mes`: the selected default opening.
- `data.alternate_greetings`: alternate openings in their locked order.
- `data.name`: the sole character's display name only when the locked mode is exactly `single_character_card` and exactly one authored character exists; otherwise the project title for world, scenario, gameplay, ensemble, narrator, anchor-character, or any other project-shaped card.
- ordinary card metadata: packaging identity only.

For new cards, advanced-definition fields may stay empty when CharacterBook routing is cleaner, but they are valid host slots rather than forbidden fields. Use `data.personality`, `data.scenario`, `data.mes_example`, `data.creator_notes`, `data.system_prompt`, or `data.post_history_instructions` when the project, a traditional card layout, a host/plugin behavior, or a compact always-on contract benefits from them. Avoid accidental semantic duplication, but never reject a new card merely because one of these fields is intentionally populated. When revising an imported card, preserve unknown or user-authored values unless the user authorizes migration or replacement.

Prefer CharacterBook for independently schedulable world facts, authored characters, named NPCs, systems, scenes, narrative rules, dialogue examples, and model-facing runtime contracts. A primary character remains only a narrative anchor and never owns `data.description` outside a true single-character project. One named character per entry is a useful default, not a prohibition against deliberate grouping. Keep material together or place it elsewhere when another host slot, runtime component, or project-specific arrangement works better; record the chosen destination instead of forcing duplicate CharacterBook coverage.

Every generated or managed non-empty CharacterBook must become the card's main worldbook. With an explicit book name, require `data.extensions.world === data.character_book.name`; otherwise solidify SillyTavern's `<data.name>'s Lorebook` fallback name before binding. For non-single projects, `data.name` is the project title. If an imported card already binds a different main worldbook, block and resolve the conflict during integration rather than silently replacing it.

Prefer Simplified Chinese for this user's visible card text, names, UI, and reports when it fits the project. English, mixed language, technical keys, or deliberately exposed IDs are valid aesthetic or gameplay choices. Keep machine identities stable regardless of display language.

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

Absorb multiple answers from one message in one pass. Stage boundaries restrict what is asked and formally locked, not what the AI may think about. Freely brainstorm across the whole RP project, identify downstream opportunities, compare technical routes, and explain propagation effects; record out-of-stage decisions as a backlog instead of interrogating or locking them prematurely.

## NSFW Switch

Preflight records one explicit `enabled` or `disabled` authoring choice unless it is already locked. This value is author-side metadata only. Never project the switch itself, an `NSFW on/off` label, a restriction card, a refusal rule, a safety questionnaire, or a runtime gate into model-visible prompts, CharacterBook, openings, UI, MVU, or EJS unless the user explicitly designs such a gameplay mechanic.

- `enabled`: the skill may proactively create mature or explicit material and should integrate it naturally into the normal world, character, system, scene, narrative, opening, and UI modules. Treat this dimension as fully delegated by default; do not ask about intensity, boundaries, permission lists, or repeated confirmation.
- `disabled`: do not proactively load or expand specialized adult templates. This is not an anti-NSFW rule: do not delete, sanitize, classify, or block mature themes already present in user materials or naturally arising RP, and never tell the play model that NSFW is disabled or that it must refuse related content.

The operational rule is: enabled means write it directly; disabled means do not specialize it; neither state installs a runtime content gate. Mention the switch only in author-side preflight/state reports.

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

- Ask and lock only decisions owned by the current stage, while allowing unrestricted cross-stage brainstorming, impact analysis, and backlog capture. Never repeat known information.
- Optimize for the user's desired experience, beauty, immersion, and functionality. Do not downgrade a feature because it is unconventional, private-API-based, version-sensitive, difficult to publish, or dependent on remote/local services.
- Treat UI/UX principles, page counts, module counts, navigation counts, Chinese localization, mobile widths, touch sizes, accessibility, offline fallback, visual signatures, and portability as recommendations selected by project intent, never universal blockers.
- Treat browser and host capabilities as tools, not forbidden keywords. `innerHTML`, inline handlers, storage, network APIs, remote dependencies, dynamic code, parent DOM, plugin internals, and custom adapters are allowed when useful. Judge actual data flow and runtime behavior.
- Preserve the user-defined hard bans: no page-level persistent status bar/panel and no modification of SillyTavern, Tavern Helper, or other plugin source to accommodate a card.
- Preserve unknown fields and original inputs when revising imported cards. Unpack first, edit maintained sources, and never overwrite or delete user data without authorization.
- During positioning, lock a project title, card mode, and non-empty actor-free `card_entry`. A true single-character card may use its sole character name; project-shaped cards use the project title.
- During the character checkpoint, inventory actual authored people without inventing a card owner. Procedural inhabitants remain world/system/narrative behavior unless promoted to stable authored assets.
- Give every maintained source a deliberate projection disposition. CharacterBook is preferred for model-facing schedulable modules, but advanced fields, greetings, scripts, regexes, UI, runtime adapters, build-only sources, and explicit exclusions are valid destinations.
- Design CharacterBook scheduling from actual runtime need. Activation, insertion, order, probability, scan depth, and recursion choices must be structurally valid, but unusual strategies are allowed when intentional.
- Give deterministic runtime fields coherent types, paths, writers, readers, defaults or initialization, operations, and lifecycle. Semantic model-maintained fields need only enough structure for their claimed behavior.
- The bundled MVU route natively implements `same_generation`. Other update modes are valid extension goals and may be implemented by a registered custom adapter; do not claim them operational until their request, routing, parse, validation, commit, and fallback chain actually exists.
- Resolve each opening to a coherent initialization when deterministic state is enabled. Presentation variants may change expression; whether they share facts or state is a project decision that must remain internally consistent.
- Deliver message UI in whatever complete architecture best serves the card. Large integrated pages, many tabs, technical views, remote libraries, local preferences, host DOM bridges, and project-specific layouts are allowed. Source line count is never a quality metric.
- Design message runtimes for the lifecycle they actually encounter. Editing, regeneration, history loading, opening swipe, and repeated execution must not produce broken controls, duplicate actions, data drift, loops, or cross-chat leakage. Use any binding/cleanup technique that passes those checks.
- Known SillyTavern replacement behavior remains a correctness constraint: raw `$1`, `$&`, named-entity collisions such as `&&current`, or malformed regex/JavaScript must be escaped, constructed differently, or handled by Forge before final output.
- Missing real-host evidence never blocks design, implementation, building, or candidate delivery. Keep evidence at `runtime: not_run` until observed, then report what was actually tested without pretending offline success proves host behavior.
- When MVU is enabled through the bundled route, build the complete engine/schema/guard and model-facing contract chain required by that route. Custom routes may use different registered components if their references and runtime behavior are complete.
- Default final delivery remains one character-card `.json`; additional formats are generated only when explicitly requested.

## Delivery Gate

Before final delivery, run Forge `validate` and `roundtrip`, then apply [validation.md](references/validation.md). Claim completion only when maintained sources, generated artifacts, state records, and evidence agree.

The final handoff must list:

1. completed and skipped stages;
2. locations of user-locked and AI-delegated decisions;
3. maintained sources and generated artifacts;
4. `assembly.yaml`, media inventory, and applicable `runtime-state.schema.json`;
5. offline, artifact, and real runtime evidence separately;
6. remaining actions the user must confirm in SillyTavern.
