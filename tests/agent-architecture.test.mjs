import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import YAML from "yaml";

import { CAPABILITY_IDS, STAGE_PRIMARY_SKILL } from "../scripts/forge/agent-routing.mjs";
import { makeProject, makeState, validateProjectModel } from "../scripts/forge/project.mjs";

const root = process.cwd();

test("repository is a single Agent with private skills and no legacy monolithic entry", () => {
  assert.equal(existsSync(path.join(root, "AGENT.md")), true);
  assert.equal(existsSync(path.join(root, "agent.yaml")), true);
  assert.equal(existsSync(path.join(root, "SKILL.md")), false);
  assert.equal(existsSync(path.join(root, "agents", "openai.yaml")), false);

  const manifest = YAML.parse(readFileSync(path.join(root, "agent.yaml"), "utf8"));
  assert.equal(manifest.entry, "AGENT.md");
  assert.equal(manifest.invocation.mode, "explicit_only");
  assert.equal(manifest.invocation.natural_language_trigger, false);
  const agentText = readFileSync(path.join(root, "AGENT.md"), "utf8");
  assert.match(agentText, /系统层可以按项目本体需要定义主控身份/);
  assert.match(agentText, /世界、NPC 和场景应拥有自己的因果运动/);

  const routing = YAML.parse(readFileSync(path.join(root, "orchestrator", "routing.yaml"), "utf8"));
  const privateSkills = Object.entries(routing.skill_paths);
  assert.equal(privateSkills.length, 8);
  for (const [id, relative] of privateSkills) {
    const text = readFileSync(path.join(root, relative), "utf8");
    assert.match(text, new RegExp(`name: ${id.replaceAll("-", "\\-")}`));
    assert.match(text, /Private|私有/);
  }
});

test("human routing manifest and Forge routing code stay identical", () => {
  const routing = YAML.parse(readFileSync(path.join(root, "orchestrator", "routing.yaml"), "utf8"));
  for (const [stage, skill] of Object.entries(STAGE_PRIMARY_SKILL)) {
    assert.equal(routing.stages[stage].primary_skill, skill, stage);
  }
});

test("capability registry and Forge capability IDs stay identical", () => {
  const registry = YAML.parse(readFileSync(path.join(root, "orchestrator", "capabilities.yaml"), "utf8"));
  const ids = registry.capabilities.map((entry) => entry.id);
  assert.deepEqual(ids, [...CAPABILITY_IDS]);
  assert.equal(registry.capabilities.find((entry) => entry.id === "host.streaming_surface").owner, "st-host-capabilities");
  assert.equal(registry.capabilities.find((entry) => entry.id === "host.worldbook_binding").owner, "st-host-capabilities");
});

test("new project ledger records current private skill and handoff collection", () => {
  const project = makeProject({ name: "雾港夜班", nsfw: true });
  const state = makeState(project);
  assert.equal(project.workflow.current_stage, "positioning");
  assert.equal(project.agent.architecture, "single_agent_private_skills");
  assert.equal(project.agent.active_skill, "rp-project-foundation");
  assert.equal(project.agent.writable_stage, "positioning");
  assert.deepEqual(project.agent.readable_stages, ["preflight", "positioning"]);
  assert.deepEqual(project.handoffs, []);
  assert.deepEqual(project.capabilities, { enabled: [], planned: [], evidence: [] });
  assert.deepEqual(validateProjectModel(project, state).issues, []);
});

test("capability registry can be planned, enabled, and evidenced without adding a new user stage", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "rp-agent-capability-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const forge = path.join(root, "scripts", "rp-card-forge.mjs");
  const run = (...args) => spawnSync(process.execPath, [forge, ...args, "--json"], { cwd: root, encoding: "utf8" });
  const route = JSON.stringify(["positioning", "worldbuilding", "character", "narrative_opening", "integration"]);
  let result = run("init", temp, "--nsfw", "disabled", "--stages", route);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  result = run("state", temp, "capability", "plan", "host.worldbook_binding");
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  result = run("state", temp, "capability", "enable", "host.worldbook_binding", "--notes", "项目要求零手工挂载");
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  result = run("state", temp, "capability", "evidence", "host.worldbook_binding", "--status", "pass", "--level", "artifact_checked", "--notes", "卡内声明和装配绑定一致");
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const project = YAML.parse(await readFile(path.join(temp, "project.yaml"), "utf8"));
  assert.deepEqual(project.capabilities.enabled, ["host.worldbook_binding"]);
  assert.deepEqual(project.capabilities.planned, []);
  assert.deepEqual(project.capabilities.evidence[0], { id: "host.worldbook_binding", status: "pass", level: "artifact_checked", notes: "卡内声明和装配绑定一致" });
});

test("Forge stage routing and handoff commands update the shared ledger", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "rp-agent-ledger-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const forge = path.join(root, "scripts", "rp-card-forge.mjs");
  const run = (...args) => spawnSync(process.execPath, [forge, ...args, "--json"], { cwd: root, encoding: "utf8" });
  const route = JSON.stringify(["positioning", "worldbuilding", "character", "mvu_ejs", "narrative_opening", "status_ui", "integration"]);
  let result = run("init", temp, "--nsfw", "enabled", "--stages", route);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

  result = run("state", temp, "handoff", "ui_missing_state", "mvu_ejs", "状态栏字段没有真实变量路径", "--severity", "blocking", "--suggested", JSON.stringify(["新增路径", "改用现有字段"]));
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

  const project = YAML.parse(await readFile(path.join(temp, "project.yaml"), "utf8"));
  assert.equal(project.agent.active_skill, "rp-project-foundation");
  assert.equal(project.handoffs[0].source_stage, "positioning");
  assert.equal(project.handoffs[0].target_stage, "mvu_ejs");
  assert.equal(project.handoffs[0].severity, "blocking");

  result = run("state", temp, "handoff-status", "ui_missing_state", "accepted");
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const accepted = YAML.parse(await readFile(path.join(temp, "project.yaml"), "utf8"));
  assert.equal(accepted.handoffs[0].status, "accepted");
});
