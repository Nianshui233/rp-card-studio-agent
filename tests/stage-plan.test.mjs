import assert from "node:assert/strict";
import test from "node:test";

import { applyStageRoute, makeProject, makeState, migrateProject, migrateState } from "../scripts/forge/project.mjs";

const route = ["positioning", "worldbuilding", "character", "mvu_ejs", "narrative_opening", "integration"];

test("stage plan is recorded separately from actual skipped state", () => {
  const project = makeProject({ name: "雾港夜班", nsfw: true, stageRoute: route });
  const state = makeState(project);
  assert.deepEqual(project.workflow.planned_stages, route);
  assert.equal(project.decisions.some((decision) => decision.id === "preflight.stage_route"), false);
  assert.equal(state.stages.materials.status, "not_started");
  assert.equal(state.stages.systems.status, "not_started");
});

test("stage plan can be revised without force or a decision lock", () => {
  const project = makeProject({ name: "雾港夜班", nsfw: false, stageRoute: route });
  const next = [...route.slice(0, 3), "systems", ...route.slice(3)];
  assert.deepEqual(applyStageRoute(project, next), next);
  assert.deepEqual(project.workflow.planned_stages, next);
});

test("legacy selected stages migrate to the adjustable plan and remove the old lock", () => {
  const project = makeProject({ name: "旧项目", nsfw: false, stageRoute: route });
  project.workflow.selected_stages = project.workflow.planned_stages;
  delete project.workflow.planned_stages;
  project.decisions.push({ id: "preflight.stage_route", stage: "preflight", summary: "old", value: route, decided_by: "user", locked: true, status: "active", rationale: "old", round: 1, history: [] });
  const state = makeState(makeProject({ name: "旧项目", nsfw: false, stageRoute: route }));
  state.decision_locks.push({ decision_id: "preflight.stage_route", value_hash: "a".repeat(64), locked_by: "user", locked_at: "2026-08-16T00:00:00Z" });
  const migratedProject = migrateProject(project);
  const migratedState = migrateState(state, migratedProject.value);
  assert.deepEqual(migratedProject.value.workflow.planned_stages, route);
  assert.equal(migratedProject.value.workflow.selected_stages, undefined);
  assert.equal(migratedProject.value.decisions.some((decision) => decision.id === "preflight.stage_route"), false);
  assert.equal(migratedState.value.decision_locks.some((lock) => lock.decision_id === "preflight.stage_route"), false);
});
