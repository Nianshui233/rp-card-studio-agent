import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIXED_INTERVIEW_STAGES,
  INTERVIEW_ROUTES,
  getInterviewRoute,
  routeNodeIds,
  validateInterviewRouteCompletion,
  validateInterviewRouteDefinitions,
  validateInterviewRouteProgress,
} from '../scripts/production/interview-routes.mjs';
import { createStageLedger, validateStageLedger } from '../scripts/continuation/stage-ledger.mjs';
import { recordInterviewNode, startStage, submitHandoff } from '../scripts/continuation/ledger-transition.mjs';

test('fixed interview route definitions are structurally valid and exclude deferred runtime routes', () => {
  const result = validateInterviewRouteDefinitions();
  assert.equal(result.ok, true, result.issues.join('\n'));
  assert.deepEqual(FIXED_INTERVIEW_STAGES, ['brainstorm', 'positioning', 'worldbuilding', 'character', 'systems', 'scenes', 'narrative_opening']);
  for (const stage of ['mvu', 'ejs', 'runtime_bridge', 'opening_frontend', 'message_frontend']) {
    assert.equal(getInterviewRoute(stage), null);
  }
});

test('world, character, systems, scenes, and narrative routes retain their intended ordered nodes', () => {
  assert.deepEqual(routeNodeIds('worldbuilding'), [
    'metadata', 'genre_tone', 'time_place_scope', 'information_layers', 'core_conflict',
    'world_rules', 'species_factions_society', 'ordinary_life', 'history_timeline',
    'change_boundaries', 'cross_world_rules', 'world_consistency_check',
  ]);
  assert.deepEqual(routeNodeIds('character'), [
    'world_role', 'want_fear', 'values_boundaries', 'behavior_situations',
    'knowledge_boundary', 'speech_expression', 'relationships_agency', 'background_growth',
    'character_behavior_check',
  ]);
  assert.deepEqual(routeNodeIds('systems'), [
    'system_purpose', 'choice_loop', 'dimensions_ranges', 'threshold_behavior',
    'calculation', 'context_and_limits', 'boundaries', 'visible_feedback',
    'system_judgment_check',
  ]);
  assert.deepEqual(routeNodeIds('scenes'), [
    'scene_purpose', 'spatial_structure', 'key_areas', 'access_security',
    'inhabitants_ecology', 'resources_destruction', 'clues_information', 'time_events',
    'scene_rules', 'scene_boundaries_check',
  ]);
  assert.deepEqual(routeNodeIds('narrative_opening'), [
    'narrative_viewpoint', 'prose_style', 'narrative_opening_policy',
    'opening_situation', 'opening_consistency_check',
  ]);
});

test('route progress rejects out-of-order, duplicate, unknown, and invalid-status entries', () => {
  const result = validateInterviewRouteProgress({
    stage: 'character',
    visited: ['want_fear', 'world_role', 'world_role', 'not-a-node'],
    nodeStatus: { world_role: 'made_up_status' },
  }, 'character');
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' '), /顺序错误/);
  assert.match(result.issues.join(' '), /重复访问/);
  assert.match(result.issues.join(' '), /路线外节点/);
  assert.match(result.issues.join(' '), /状态无效/);
});

test('route completion cannot be claimed while a node is merely proposed or unvisited', () => {
  const route = INTERVIEW_ROUTES.stages.positioning.nodes.map((node) => node.id);
  const result = validateInterviewRouteCompletion({
    stage: 'positioning',
    visited: route.slice(0, 2),
    nodeStatus: { player_promise: 'confirmed', player_control: 'delegated' },
  }, 'positioning');
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' '), /尚未访问节点/);
  assert.match(result.issues.join(' '), /尚未以关闭状态结算/);
});

test('delegated is a closed route status but remains distinct from confirmed', () => {
  const route = INTERVIEW_ROUTES.stages.brainstorm.nodes.map((node) => node.id);
  const progress = { stage: 'brainstorm', visited: route, nodeStatus: Object.fromEntries(route.map((id) => [id, 'delegated'])) };
  assert.equal(validateInterviewRouteCompletion(progress, 'brainstorm').ok, true);
  assert.equal(INTERVIEW_ROUTES.node_status_contract.display_labels.delegated, '用户放权，Agent 代定（不是用户确认）');
});

test('real stage transitions track the route and block handoff until every node is closed', () => {
  const evidence = { id: 'USR-START-WORLD', role: 'user', locator: 'conversation#1', quote: '开始世界观阶段', stage: 'worldbuilding', action: 'start', targets: ['worldbuilding'], origin: 'conversation' };
  let ledger = createStageLedger();
  ledger.stages.find(stage => stage.id === 'preflight').progress = 'not_started';
  ledger.stages.find(stage => stage.id === 'worldbuilding').enabled = 'enabled';
  ledger = startStage(ledger, { stage: 'worldbuilding', evidence, trackInterviewRoute: true });
  assert.equal(ledger.stages.find(stage => stage.id === 'worldbuilding').interviewRoute.status, 'tracking');
  assert.throws(() => submitHandoff(ledger, { stage: 'worldbuilding', handoff: { id: 'WORLD-1', locator: 'conversation#handoff', artifacts: ['世界观.yaml'] } }), /尚未结算/);
  const route = getInterviewRoute('worldbuilding');
  for (const node of route.nodes) ledger = recordInterviewNode(ledger, { stage: 'worldbuilding', node: node.id, status: 'source_resolved' });
  const row = ledger.stages.find(stage => stage.id === 'worldbuilding');
  assert.equal(row.interviewRoute.status, 'complete');
  assert.equal(validateStageLedger(ledger, 'worldbuilding').ok, true);
  ledger = submitHandoff(ledger, { stage: 'worldbuilding', handoff: { id: 'WORLD-1', locator: 'conversation#handoff', artifacts: ['世界观.yaml'] } });
  assert.equal(ledger.stages.find(stage => stage.id === 'worldbuilding').progress, 'awaiting_handoff');
});

