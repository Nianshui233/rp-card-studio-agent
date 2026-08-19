export const AGENT_ARCHITECTURE = "single_agent_private_skills";

export const CAPABILITY_IDS = Object.freeze([
  "agent.project_blueprint",
  "engineering.component_registry",
  "engineering.regex_trace",
  "host.api_reference",
  "host.runtime_debug",
  "host.message_history",
  "host.message_lifecycle",
  "host.variable_scopes",
  "host.worldbook_binding",
  "host.worldbook_runtime",
  "host.regex_control",
  "host.script_lifecycle",
  "host.prompt_generation",
  "host.prompt_injection",
  "host.streaming_surface",
  "host.parent_dom_bridge",
  "runtime.ejs_phases",
  "frontend.compiled_application",
  "frontend.zero_layer",
  "frontend.asset_library",
  "runtime.external_dependency",
  "host.api_resolution",
  "host.runtime_version",
  "host.regex_replay",
  "host.audio_surface",
]);

export const CAPABILITY_ID_SET = new Set(CAPABILITY_IDS);

export const STAGE_PRIMARY_SKILL = Object.freeze({
  preflight: null,
  positioning: "rp-project-foundation",
  materials: "rp-project-foundation",
  worldbuilding: "rp-project-foundation",
  character: "rp-cast-authoring",
  systems: "rp-experience-authoring",
  scenes: "rp-experience-authoring",
  mvu_ejs: "st-runtime-authoring",
  narrative_opening: "rp-experience-authoring",
  status_ui: "st-frontend-authoring",
  integration: "st-integration-qa",
});

export function primarySkillForStage(stage) {
  if (!Object.hasOwn(STAGE_PRIMARY_SKILL, stage)) {
    throw new Error(`未知 Agent 阶段: ${stage}`);
  }
  return STAGE_PRIMARY_SKILL[stage];
}

export function readableStagesForState(stages, activeStage, orderedStages) {
  return orderedStages.filter((stage) => {
    if (stage === activeStage) return true;
    const status = stages?.[stage]?.status;
    return status === "complete" || status === "skipped";
  });
}

export function agentLedgerForStage(stage, stages, orderedStages) {
  const activeSkill = primarySkillForStage(stage);
  if (!activeSkill) throw new Error("preflight 由主 Agent 直接处理，不分派私有 Skill");
  return {
    architecture: AGENT_ARCHITECTURE,
    active_skill: activeSkill,
    writable_stage: stage,
    readable_stages: readableStagesForState(stages, stage, orderedStages),
  };
}
