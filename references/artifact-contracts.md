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

- `player_visible`: may appear directly in openings, status UI, or player-facing explanations;
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

Keep these advanced-definition fields empty for a newly authored card:

```text
data.personality
data.scenario
data.mes_example
data.creator_notes
data.system_prompt
data.post_history_instructions
```

SillyTavern injects `description` as an always-present prompt block; it does not dynamically route content on its own. Keep the entry compact and do not place any character dossier, independently scheduled world module, system rules, narrative contracts, or status-output contracts there. Imported legacy values are different: preserve user-authored or unknown values losslessly unless a deliberate migration is authorized, and report rather than silently deleting them. Completing positioning transfers `name`/`description` ownership to the project, not deletion authority over advanced-definition fields. Clear those fields only after migration is complete and `integration.advanced_definition_policy` is locked to `clear_after_migration` or `migrate_to_characterbook`.

### CharacterBook-first modularization

Every eligible module other than the card-entry and greeting projections should be represented by an enabled CharacterBook entry:

- every authored character, including any `primary_character`, one named character per entry by default;
- world facts and continuity rules;
- each system or coherent system module;
- each independently triggerable scene or location module;
- narrative rules and dialogue examples;
- MVU initialization/update/output contracts and EJS templates;
- the status-bar reply-format contract when status UI is enabled without MVU.

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

Map every locked source other than the card entry and openings to one or more CharacterBook entries. For every entry, explicitly design and record:

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

Build a character payload in this order:

```text
assembly
-> MVU CharacterBook entries
-> EJS CharacterBook entries
-> preserved imports
-> Tavern Helper scripts
-> SillyTavern character regexes
-> main CharacterBook binding
```

Each projector consumes the previous payload and merges its issues/warnings. A later adapter may not conceal an earlier contract failure.

### MVU and EJS

- The embedded MVU adapter targets Tavern Helper's `Mvu` API, waits boundedly for `waitGlobalInitialized("Mvu")`, subscribes to all public `Mvu.events.*` before bootstrapping from `getMvuData(options)`, and removes the exact `(event, handler)` pairs on cleanup. It must not fall back to `getVariables()`, `globalThis.MVU`, or invented event names.
- An MVU-enabled card carries three managed Tavern Helper role scripts in stable ID order: the pinned MVU engine, a Zod schema registrar compiled from the variable ledger, and the runtime guard. The registrar calls `registerMvuSchema(Schema)` and is not replaced by the offline runtime-state JSON Schema.
- The CharacterBook carries a D1/D0 current-variable entry using `format_message_variable::stat_data`, plus update rules and output format. These three model-facing prompts are part of the runtime contract.
- Embedded MVU storage currently supports message targets. `latest_message` maps to `{ type: "message", message_id: "latest" }`; `current_message` uses a numeric host message context and otherwise explicitly degrades to latest. Initialization fills defaults in the host event object without a second write; bootstrap may persist missing defaults once. Reject an invalid update atomically.
- Automatic updates currently support `same_generation`. `extra_pass` or `both` requires a verified independent request, routing, response parser, protocol validation, atomic commit, and failure handling. A parser or commit helper alone does not implement this chain.
- EJS uses SillyTavern's `ST-Prompt-Template 1.17.6.8` (`globalThis.EjsTemplate`). EJS projects only to `data.character_book.entries[]`, never Tavern Helper scripts. Host entries stay disabled and constant with empty keys and preserve adjacent `@@always_enabled` plus generate/render decorators. Split `target: both` into generate and render entries.
- EJS conditions are structured `condition.runtime_path/operator/value` with `branches.when_true/when_false/fallback`. Pure EJS uses a ledger-typed default with `getvar()`. MVU-linked EJS accepts only the verified message/stat_data/current-or-latest contract and reads `Mvu.getMvuData()` after a bounded wait. Missing snapshots, namespace, or paths use `branches.fallback`; never disguise missing state with a default that selects true or false.

### Status UI

- Status UI appears only inside AI messages. The delivery paths are SillyTavern character regex or Tavern Helper message-level JS/iframe.
- A simple embedded regex replaces `<StatusPlaceHolderImpl/>` with self-contained text/static HTML. It is fixed to `refresh: on_message`, `read_only: true`, `commands: []`, and a non-tab layout. Its missing/loading/error/degraded strings are design metadata, not proof of runtime branching or reliable per-message history.
- Dynamic refresh, commands, tabs, conditional states, or reliable historical snapshots require `tavern_helper_message + host_required`. The regex emits self-contained fenced HTML; Tavern Helper creates an iframe in that same message. The script validates an integer `getCurrentMessageId()`, repeatedly reads `getVariables({ type: "message", message_id })` for that exact floor, does not stop at an inherited first snapshot, redraws only on visible changes, and cleans up on `pagehide`/`unload`. It must never read `latest`, access the parent page, create page-level nodes, or load remote UI.
- Record scoped-regex authorization, Tavern Helper character-script enablement, macro enablement, ST-Prompt-Template enablement when applicable, and observed MVU startup separately. Blob URL rendering is diagnostic evidence only: recommend disabling it and refreshing only when the target host actually observes `mvu_started: false` while the option is enabled. The option alone proves neither success nor failure.
- Forge appends one placeholder idempotently to the default and alternate openings. With MVU, the later reply-format entry must tell the model not to output a placeholder because MVU appends it at runtime. Without MVU, generate a dedicated Chinese-named constant entry requiring exactly one trailing placeholder. Remove the old managed marker from `post_history_instructions` and never write the new contract there.
- With MVU, generate separate prompt/display regexes that hide only complete `<initvar>...</initvar>` blocks and preserve the raw message, a prompt-only update filter that defaults to `hide_all`/`minDepth: null`, and stream/final display hiding for update blocks. The explicit `keep_recent_updates` option maps to `minDepth: 4`. Set `runOnEdit: true` on display-side rules and false on prompt-only rules. Generate `[不发送]界面占位符` separately from `[界面]状态栏`. Use stable UUIDs, non-greedy multi-block matching, fixed managed order, and collision protection.
- SillyTavern's first-use regex authorization is a host security mechanism. Report it in handoff; never bypass or fake it.

## 10. NSFW Projection

Lock NSFW only during project preflight.

- `enabled: false`: omit specialized fields, groups, rules, conditions, and placeholders from character, system, openings, MVU, EJS, and UI.
- `enabled: true`: merge already confirmed relevant content into normal character and status structures without a separate questionnaire or repeated switch prompt.
- Platform-level constraints always apply.
- GM visibility remains independent; enabling the feature does not make private fields player-visible.

Load the two mix-ins under `assets/templates/nsfw/` only when enabled. Do not create empty keys when disabled.

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
