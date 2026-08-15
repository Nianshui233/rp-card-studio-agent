# Artifact Contracts

This reference defines fact ownership, directory responsibilities, references, and change propagation. Conversation may be flexible; persisted project structure must remain deterministic enough to resume work, revise imported cards, and prove round-trip fidelity.

## 1. Project Layout

```text
project-workspace/
|-- project.yaml
|-- .rp-card-state.json
|-- src/
|   |-- world/
|   |-- positioning/
|   |-- characters/
|   |-- systems/
|   |-- scenes/
|   |-- mvu/
|   |-- prompts/
|   |-- ui/
|   |-- integration/
|   |   `-- assembly.yaml
|   `-- import/                 # imported-card projects only
|-- dist/
|   |-- character-card.json
|   |-- character-card.png
|   `-- worldbook.json
`-- reports/
    |-- build-manifest.json
    |-- runtime-state.schema.json  # only when runtime state is enabled
    |-- validation.json
    `-- handoff.md
```

Templates live under `assets/templates/`. During initialization, copy only the templates justified by information already locked in preflight. An RP project targeting character-card delivery starts with `project.yaml`, `.rp-card-state.json`, and `src/positioning.yaml`; it must not create a character source merely because the delivery format is named a character card. When NSFW is enabled, initialization may also create the status-UI source, but it still creates no placeholder character. The character template is copied only after the required character inventory checkpoint confirms a pre-authored character. Unpacking keeps the complete legacy card at project scope in `src/import/original.json`; it must not turn `data.name` into a draft person. Existing older projects with `role: pending` candidates remain compatible, but inventory must classify or remove them before locking. The template named `state.json` must become `.rp-card-state.json` in the project.

## 2. Two Sources of Truth

### `project.yaml`: semantic source of truth

Record decisions that change what the work is:

- project identity, workspace, deliverables, and stage route;
- the current work-run operation (`create`, `continue`, `convert`, `edit`, `audit`, or `ui`), refreshed transactionally when an existing workspace is resumed;
- the locked NSFW switch;
- feature switches and optional-stage decisions;
- locked decisions, cross-stage todos, and input-material references;
- the source manifest, including `source_manifest.assembly`, target runtime, and delivery constraints.

Propagate these decisions into `src/`. A build tool must never invent semantic content from `.rp-card-state.json`.

`project.project.operation` describes the current work run, not immutable project provenance. Forge `init` owns `create`, `unpack` owns `convert`, and `state <workspace> operation ...` owns transitions for existing projects. Lifecycle validation may use this explicit value; it must not infer a run type from revision counts, stage rounds, or prior build records.

### `.rp-card-state.json`: technical source of truth

Record workflow and tool state:

- current stage, turn number, waiting/completed state;
- lock hashes, delegation source, and timestamps;
- dirty-source flags, latest build, validation runs, and transaction state;
- technical indexes for cross-stage todos, never the only copy of their content.

Forge owns this file. After a manual change, run `state` and `validate` to restore consistency. Deleting it must not delete creative content, but it does discard progress and evidence indexes.

### Conflict resolution

- For semantic conflicts, `project.yaml` and its locks win; invalidate stale technical state and rebuild.
- For stage-state conflicts, inspect stage summaries, lock hashes, and validation evidence together; never silently claim completion.
- If `project.yaml` disables a feature but `src/` or `dist/` still contains that feature in a new project, treat it as a blocker. A retained imported implementation must be explicitly recorded.

## 3. `src`, `dist`, and `reports`

| Layer | Responsibility | Prohibited use |
| --- | --- | --- |
| `src/` | Human-maintained world, character, system, scene, MVU, prompt, UI, and assembly sources | Build caches; reverse-filling content from `dist/` |
| `dist/` | Deterministically generated JSON, PNG, worldbook, and related importable artifacts | Direct editing; source for the next creative iteration |
| `reports/` | Build inputs, differences, validation evidence, unverified items, and handoff records | Treating recommendations as locked decisions |

Build from `project.yaml + src/` into a candidate directory, validate it, then commit the candidate into `dist/`. Equivalent semantic inputs and parameters must produce semantically equivalent artifacts. Timestamps and absolute paths are non-semantic and must not affect comparison.

## 4. IDs, Paths, and Visible Names

- Use stable English `snake_case` for machine IDs, directories, schema keys, and field paths.
- Use Simplified Chinese for user-visible project titles, CharacterBook names and entry comments, regex names, script names, UI labels, and creative prose whenever practical.
- Keep an ID stable after it enters an artifact or saved state, even if its Chinese display name changes.
- Use explicit references such as `{kind}:{id}` or schema-defined ID fields; never rely on a translated title as an implicit join key.
- Use dot paths such as `relationship.trust` for semantic fields and separately register runtime paths such as `stat_data.relationship.trust`.
- Use JSON Pointer only in patch protocols; do not mix it with dot paths.
- Preserve explicit `order` when array order carries meaning. Canonically sort unordered object keys during generation.

## 5. Player, GM, and Model Layers

Every world, character, system, scene, and narrative source must distinguish:

- `surface_layer`: may appear directly in openings, status UI, or audience-facing explanations;
- `gm_only`: may guide narration but must never be directly revealed before discovery;
- `model_only`: routing, writing, and execution rules that are not in-world facts.

Project by audience rather than concatenating whole source files. Status UI may bind only player-visible values, and EJS must not bypass visibility. Split mixed public/secret content at the source instead of expecting the model to redact it during projection.

## 6. RP Package, Card-Front, and CharacterBook Ownership

From the host and user perspective, treat the imported SillyTavern character-card JSON/PNG artifact as the complete portable deployment package of an RP project, not an empty shell or a dossier for one person. World, authored or dynamic characters, systems, scenes, narrative contracts, regex/scripts, runtime adapters, and message UI are peer modules; none is nested under or owned by a character. Use the card front as a small, stable project-entry surface and CharacterBook as the modular instruction/content layer.

The maintained RP project is the source domain model; card JSON, card PNG, and standalone worldbook files are delivery projections. Dependency direction is one-way: maintained project modules are scheduled and adapted into a host artifact. Never reshape source ownership around the host schema. A host projection may expose character-shaped field names without changing ownership in the source model.

Artifact format is project-level packaging metadata. For a new card, the locked `integration.delivery_format` decision selects Character Card V2 or V3; never store a whole card payload under one character merely to choose the host version. Imported artifacts retain their original spec unless the integration stage explicitly migrates it.

Use the sole character's name only when the locked mode is truly single-character and exactly one authored character exists. World, scenario, gameplay, ensemble, narrator, anchor-character, and all multi-character projects use the locked project title. A non-single project title should identify the package's world, gameplay, theme, or experience rather than defaulting to one character or one isolated location.

### Card-front fields for a new card

| Field | Allowed content |
| --- | --- |
| `data.name` | Sole character's visible name only for a true single-character card with exactly one authored character; otherwise the locked project title |
| `data.description` | Compact actor-free package entry from the non-empty `positioning.card_entry`: purpose, user entry, interaction mode, and routing intent only |
| `data.first_mes` | The selected default opening text |
| `data.alternate_greetings` | Alternate opening texts in locked order |
| metadata fields | Packaging identity such as tags, creator, and version; not world or behavior modules |

Advanced-definition fields are valid SillyTavern host slots rather than forbidden territory:

```text
data.personality
data.scenario
data.mes_example
data.creator_notes
data.system_prompt
data.post_history_instructions
```

Leave them empty when CharacterBook routing is cleaner, but use them when a compact always-on contract, traditional card compatibility, a plugin behavior, creator notes, example dialogue, or project-specific host semantics benefit from them. A maintained project writes them deliberately through `assembly.card_fields`; absence means “preserve or use the default,” while an explicitly present string means “project this value.” Avoid accidental duplication, but never reject a card merely because an advanced-definition field is intentionally populated.

SillyTavern injects `description` as an always-present prompt block, so keep that field as the compact actor-free package entry. Do not turn it into a character dossier. Imported legacy advanced definitions remain lossless unless a deliberate migration or explicit `card_fields` override authorizes change.

### CharacterBook-first modularization

Every eligible model-facing module other than the card-entry and greeting projections should normally be represented by an enabled CharacterBook entry. The optional user-character definition is the deliberate exception: it is projected as a disabled template until filled and enabled:

- every authored character, including any `primary_character`, one named character per entry by default;
- world facts and continuity rules;
- each system or coherent system module;
- each independently triggerable scene or location module;
- narrative rules and dialogue examples;
- MVU initialization/update/output contracts and EJS templates;
- the status-bar reply-format contract when status UI is enabled without MVU;
- an optional `user_character` source as a Chinese-named, disabled-by-default template, separate from world/NPC/scene sources and compatible with the creation UI.

Openings remain in greeting fields because SillyTavern selects them as chat entry points. All authored characters belong in CharacterBook. A `primary_character` marker means narrative anchor only; it does not grant ownership of `data.description`, priority over unrelated modules, or the card name outside a true single-character project. A true single-character card keeps its sole character in a compact constant 100% entry because that definition is the entire interaction's stable actor contract. In a world, gameplay, scenario, or ensemble project, even an anchor character may use constant, keyword, or scene routing according to whether that character is actually needed every turn.

Do not create a single catch-all entry when different content needs different triggers or insertion positions. Do not split one coherent rule so finely that a triggered fragment becomes misleading without its dependencies. Character and narrative stages classify the modules and assign stable IDs; the integration stage performs host scheduling.

When an assembly entry selects only part of a registered source, materialize an identity envelope around that fragment. The envelope records the normalized module type, stable `id` and `display_name` when the source defines them, the Chinese entry name, and the selected pointer. This keeps independently scheduled fragments attributable to their RP module without creating tiny standalone identity entries. A selected fragment is complete only when both the envelope and the selected semantics reach the CharacterBook artifact.

Scene media needs are model-facing semantics, not opaque authoring metadata. Store `media_slots` as a typed top-level scene field with a stable ID, media kind hint, narrative purpose, trigger, required flag, and non-media text fallback. Integration may bind that contract to `media_manifest`, but it must not discard the text fallback when no asset is delivered. Legacy `extensions.media_slots` remains readable only as a migration path.

Procedurally generated inhabitants are not authored character modules unless a particular generated identity is deliberately promoted into a stable, pre-authored project asset. Keep population archetypes and shared social constraints in world sources, generation/uniqueness/continuity/lifecycle rules in system sources, and portrayal constraints in narrative sources. This prevents a generated crowd from becoming a fake list of fixed NPC files.

## 7. Field Lifecycle Ledger

For every persistent runtime field, record:

| Item | Meaning |
| --- | --- |
| `source_path` | Stable semantic path |
| `runtime_path` | Actual runtime path |
| `type` | Data type and container shape |
| `default` | Initialization value |
| `constraints` | Range, enum, length, or shape constraints |
| `writer` | Sole writer and allowed operations |
| `readers` | Narration, updater, EJS, scripts, or UI consumers |
| `renderer` | Display binding, or an explicit reason for no display |
| `cleanup` | Retain, archive, truncate, or delete behavior |
| `migration` | Missing, renamed, or type-changed legacy values |
| `visibility` | `player`, `gm`, or `model` |

A field may not have a schema without an initial value or a status binding without a source. When a derived field is calculated deterministically, the model must not become a second writer.

Change propagation:

- Add: update defaults, writer, readers, update rules, renderers, and migration.
- Rename: preserve an alias or migration and update initialization, EJS, opening overrides, UI, and tests.
- Change type/range: validate defaults, comparisons, formatting, and legacy saves.
- Delete: remove writer and readers before choosing how to clean old values; leave no orphan paths.

## 8. Integration Assembly

`src/integration/assembly.yaml` is the assembly source of truth and must be registered at `project.yaml.source_manifest.assembly`.

### `worldbook_manifest`

Map every locked source other than the card entry and openings to one or more deliberate projection destinations. Model-facing modules normally use CharacterBook; the optional `user_character` template may intentionally remain disabled until filled. For every CharacterBook entry, explicitly design and record:

- `activation.mode`, primary/secondary keys, selectivity, key logic, case sensitivity, and whole-word behavior;
- `insertion.position`, explicit `insertion.depth` (`null` for every non-`at_depth` position; a non-negative integer for `at_depth`), role, and `insertion.order`;
- `probability`;
- entry-level `scan_depth`;
- `recursion.prevent_incoming`, `prevent_outgoing`, and `delay_until_recursion`;
- `fallback`.

When several selector entries split one maintained module, Forge wraps every selected fragment with a `module` envelope containing the module type, stable source ID and display name when available, the Chinese entry name, and the selector path. This keeps every fragment attributable after scheduling; do not create separate always-on `/id` or `/display_name` entries merely to preserve identity.

Explain the design, not only the values:

- Use `constant` for compact rules that must govern every generation, such as core world invariants, narrative contracts, or output protocols. Keep this set small because every constant entry consumes context every turn.
- Use `keywords` for an NPC, location, faction, object, scene, or specialized rule whose relevance can be identified from names, aliases, and unambiguous domain terms.
- Permit incoming recursion only when other entries must be able to summon this entry through generated keys. Permit outgoing recursion only when this entry's injected content should intentionally activate dependent entries. Disable both for self-contained rules and contracts. Use delayed activation only when a rule should appear solely through a recursive chain, never from the initial chat scan.
- Use probability below 100 only for deliberate stochastic variation. Never use it to hide an unresolved trigger design.
- Choose scan depth from the expected distance between the current turn and relevant mention. `null` inherits the host global setting; `0` is a real zero-depth value.
- Choose insertion position and order by instruction authority and dependency. Stable order is mandatory when entries share a position.

Current native SillyTavern delivery fixes `recipient: shared` and `visibility: model`. Other routing or isolation semantics require a separately verified router and otherwise block. Book-level scan depth, budget, and recursive scanning remain at host defaults; use entry-level controls. Character filters apply only to standalone worldbooks: `avatar_stems` are case-sensitive avatar filenames without the final extension, and `tag_ids` are opaque IDs from the target SillyTavern instance, never display labels.

The worldbuilding, character, systems, scenes, and narrative stages provide content and stable IDs only. They must not ask for or lock these host parameters.

### `media_manifest`

Register media IDs, type, local file or HTTPS URL, delivery, consumers, optional `preload`, integrity, and failure fallback. `preload` accepts only `none | on_opening | eager | on_demand`. Validate local existence, remote reachability when possible, digest, and every consumer reference during integration. Remote media cannot be the only path for critical semantic content.

Scene-authored media requirements live in the typed `scene.media_slots[]` contract and remain model-visible with their purpose, trigger, necessity, and text fallback. Integration assets that target `scene:{id}` must name one of those declared slot IDs; every `required: true` slot must have exactly one assembled asset. Older `extensions.media_slots` remains readable for migration, but new fragments must use the first-class field.

Do not create or ask for license or source-attribution fields. When an imported project contains unknown fields of that kind, preserve them under the unknown-field round-trip policy.

### Binding the main CharacterBook

A generated or managed non-empty embedded CharacterBook must be the card's main worldbook:

- with an explicit name, require `data.extensions.world === data.character_book.name`;
- without a name, solidify SillyTavern's `<data.name>'s Lorebook` fallback, then bind it; for a non-single project, `data.name` is the project title;
- if an imported card already binds another worldbook, preserve it and report `character_book.binding_conflict` until integration explicitly resolves the choice.

Equality proves only that the card points at a name. On first import into a clean host, confirm **Import Card Lore**. If the host already owns a worldbook with that name, the automatic prompt is skipped and SillyTavern initially uses the old file. Run **Import Card Lore** manually and confirm the explicit overwrite prompt, then inspect every managed `source_key` and its content. Name equality alone never proves runtime readiness.

## 9. Runtime Projection Order

Project runtime behavior in dependency order: semantic sources -> state/update contract -> adapter -> CharacterBook/model protocol -> SillyTavern regex or Tavern Helper script -> message HTML/UI. Record which layer owns each behavior so a display component never becomes the hidden source of game state.

- CharacterBook is the preferred container for independently scheduled model-facing modules, not the only legal destination. Each maintained source needs an explicit projection disposition: CharacterBook, card field, greeting, regex, script, UI, runtime/build-only, or deliberate exclusion with a reason.
- Built-in `same_generation` MVU remains the default maintained route. `extra_pass` and `both` are valid when a registered custom adapter supplies the independent request/parse/commit chain. Do not claim a capability that no adapter implements.
- EJS requires a registered ST-Prompt-Template dependency and readiness probe. Version `1.17.6.8` is the verified baseline, not a universal lock; other versions produce compatibility notes and require real-host evidence before `runtime: pass`.
- UI may use complete HTML/CSS/JavaScript, inline handlers, trusted HTML templates, `innerHTML`/`insertAdjacentHTML`, browser storage, indexedDB, fetch/XHR/WebSocket, remote libraries/fonts/media, parent-page DOM, plugin internals, private host APIs, dynamic code and custom bridges when they serve the project. Record dependencies, versions, portability and cleanup responsibilities instead of deleting the feature.
- Hard-fail only confirmed breakage: invalid HTML/JavaScript/JSON, raw SillyTavern replacement tokens that corrupt replacement output, known HTML-entity operator collisions, broken references/bindings, missing required adapter entrypoints, or lifecycle behavior that demonstrably duplicates listeners, loses data or makes controls fail.
- The only UI form explicitly prohibited by the owner is a page-level persistent status bar/panel mounted outside message content. Message-contained pages, buttons that prefill/send the SillyTavern composer, dialogs, overlays inside the message iframe and host-linked interactions are allowed.
- Do not modify SillyTavern, Tavern Helper or another plugin to make the card work. Compatibility belongs in the card/project adapter layer.
- Offline success may produce a candidate deliverable. Without real host evidence, keep `runtime: not_run`; this limits the claim, not the implementation or delivery.

## 10. NSFW Projection

Lock NSFW once during project preflight and keep the switch author-side only.

- `enabled: true`: treat the mature-content dimension as fully delegated, load the authoring mix-ins when their normal modules exist, and merge their fields into ordinary character/UI design without a separate questionnaire.
- `enabled: false`: do not proactively load specialized adult templates. Preserve mature material already supplied or naturally required by the project; do not sanitize it merely because the author-side helper was disabled.
- Never emit an NSFW on/off flag, refusal instruction, runtime gate, player-facing switch, model-facing restriction card or repeated safety reminder unless the user explicitly designs one as gameplay.
- Visibility remains a separate content-routing decision: private facts stay private because of audience semantics, not because of the NSFW switch.

The mix-ins under `assets/templates/nsfw/` are authoring scaffolds, not runtime guards.

## 11. Imported Cards and Unknown Fields

- Keep the input artifact read-only and output into the project workspace by default.
- Normalize recognized fields into `src/`. Store explainable-but-unknown fields in `src/import/preserved.json` with their original JSON paths.
- Merge preserved fields back during rebuild. If they conflict with maintained sources, report the exact difference and require an explicit policy.
- Preserve import order, CharacterBook entry IDs, extension enabled state, legacy advanced definitions, and unknown extension objects.
- Any unexplained irreversible loss is a blocker; "this skill does not use that field" is not a valid deletion reason.

## 12. Character Cards and PNG

- JSON artifacts follow `character-card.schema.json`; preserve unknown extension fields.
- Encode JSON as UTF-8 and preserve multiline meaning without turning line breaks into visible escape text.
- Add or replace only declared character-card chunks in PNG and preserve original image pixels. Record chunk keys and encoding in the build manifest.
- `pack -> unpack` must pass semantic comparison, not merely byte comparison.
- Stop on corrupt, duplicate, or priority-ambiguous chunks; never guess which payload to overwrite.

## 13. Dependency Classes

Assign one primary class to every dependency:

- `builtin`: standard SillyTavern capability;
- `embedded`: delivered with the card or worldbook;
- `host_required`: must be installed and enabled in the target host;
- `remote`: loaded remotely at runtime, with URL, version, and fallback;
- `development_only`: build or validation dependency absent from player handoff.

A successful build does not prove a host dependency exists. Only real runtime evidence may confirm installation and compatibility. Deliver runtime code with the project/card or an explicit host dependency; do not use an unregistered remote script as an assembly shortcut. Remote media remains governed by `media_manifest`.
