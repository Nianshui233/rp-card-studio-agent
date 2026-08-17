export const AGENT_ARCHITECTURE = "single_agent_private_skills";

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
