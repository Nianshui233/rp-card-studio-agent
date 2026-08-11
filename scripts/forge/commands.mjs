import { validateRuntimeSources } from '../rp-card-runtime.mjs';

import { conflictError, inputError, integrityError, unsupportedError, validationError } from './errors.mjs';
import { commitNewDirectory, commitWrites, planWrites, resolveWithin } from './fs-transaction.mjs';
import { Format, formatSummary, isCharacterFormat, isPngCharacterFormat, loadArtifact } from './formats.mjs';
import { isPlainObject, parseJsonText, prettyJson, semanticEqual, sha256 } from './json.mjs';
import { ccv3Payload, embedCardInPng, extractCardFromPng, nonCardChunkDigest, parsePng } from './png.mjs';
import {
  PROJECT_FILE,
  PROJECT_SCHEMA_VERSION,
  STATE_FILE,
  STATE_SCHEMA_VERSION,
  STAGES,
  STAGE_STATUSES,
  addPreservedImport,
  applyNsfwTemplates,
  assertDecisionId,
  assertValidSource,
  characterSourceFromCard,
  collectPreserved,
  compareLockValue,
  decisionLock,
  decisionValue,
  defaultPositioning,
  initializeProject,
  loadProject,
  loadProjectSource,
  makeProject,
  makeState,
  migrateProject,
  migrateState,
  projectOutputPaths,
  projectPngBasePath,
  projectSourcePath,
  projectTarget,
  readOriginalPng,
  readRegisteredSources,
  runProjectMutation,
  updateManagedState,
  updateProjectAndState,
  validateProjectModel,
  validateRegisteredSources,
  worldSourceFromBook,
} from './project.mjs';
import { successReport } from './report.mjs';
import { validateNamedSchema } from './schema.mjs';
import { stringifyYaml } from './yaml.mjs';

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export var HELP_TEXT = `rp-card-forge - 离线、事务式 SillyTavern 制卡工具

用法:
  rp-card-forge <command> [参数] [选项]

命令:
  init <project-dir> --nsfw <mode>   创建 project.yaml、状态与 YAML 源码骨架
  inspect <input>                    识别项目、角色卡 JSON/PNG 或世界书 JSON
  unpack <input> --nsfw <mode>       解包为可维护项目，保留原始输入与未知字段
  validate <input>                   校验项目或制品
  build <project-dir>                从源码构建 JSON 制品
  pack <project-dir>                 构建 JSON，或写入 PNG chara/ccv3 双块
  diff <left> <right>                比较语义 JSON
  roundtrip <input>                  验证 JSON/PNG 语义往返与 PNG 图像数据
  state <project-dir> [action]       show/migrate/lock/unlock/stage
  doctor [project-dir]               检查 Node、依赖与项目健康

通用选项:
  --json                             输出稳定 JSON 报告
  --dry-run                          只规划写入，不修改文件
  --output <path>                    指定输出文件或目录
  --force                            明确允许覆盖不同内容或接管陈旧事务锁
  --type character|worldbook        init 的项目类型
  --nsfw enabled|disabled           创建项目时明确锁定 NSFW 开关
  --source user|delegated           state lock 的决定来源
  --rationale <text>                state lock 的决定理由
  --summary <text>                  state stage 完成或跳过时的阶段摘要
  -h, --help                         显示帮助
  --version                          显示版本
`;
export async function runCommand(command, args, options) {
  switch (command) {
    case "init":
      return commandInit(args, options);
    case "inspect":
      return commandInspect(args, options);
    case "unpack":
      return commandUnpack(args, options);
    case "validate":
      return commandValidate(args, options);
    case "build":
      return commandBuild(args, options);
    case "pack":
      return commandPack(args, options);
    case "diff":
      return commandDiff(args, options);
    case "roundtrip":
      return commandRoundtrip(args, options);
    case "state":
      return commandState(args, options);
    case "doctor":
      return commandDoctor(args, options);
    default:
      throw unsupportedError(`未知命令: ${command}`);
  }
}
async function commandInit(args, options) {
  exactArgs("init", args, 1);
  const root = path.resolve(args[0]);
  const result = await initializeProject(root, {
    type: options.type ?? "character",
    nsfw: parseNsfwOption(options, "init"),
    force: Boolean(options.force),
    dryRun: Boolean(options["dry-run"])
  });
  return successReport("init", {
    projectRoot: root,
    projectId: result.project.project.id,
    target: projectTarget(result.project),
    dryRun: result.dryRun
  }, [], result.changes);
}
async function commandInspect(args) {
  exactArgs("inspect", args, 1);
  const artifact = await loadArtifact(args[0]);
  if (artifact.format !== Format.PROJECT) {
    return successReport("inspect", {
      path: artifact.path,
      ...formatSummary(artifact.payload, artifact.format),
      digest: artifact.digest,
      validation: summarizeValidation(artifact.validation),
      ...artifact.png ? { png: artifact.png } : {}
    });
  }
  const loaded = await loadProject(artifact.projectRoot, { allowLegacy: true });
  const model = validateProjectModel(loaded.project, loaded.state, loaded.projectRoot);
  if (loaded.project.schema_version === PROJECT_SCHEMA_VERSION) {
    const registered = await validateRegisteredSources(loaded);
    model.issues.push(...registered.issues);
  }
  let source = null;
  try {
    source = await loadProjectSource(loaded);
  } catch (error) {
    model.issues.push({ path: "/forge/source", rule: "read", message: error.message });
  }
  return successReport("inspect", {
    path: loaded.projectRoot,
    format: Format.PROJECT,
    projectId: loaded.project?.project?.id ?? null,
    target: projectTarget(loaded.project),
    schemaVersion: loaded.project?.schema_version ?? null,
    stateSchemaVersion: loaded.state?.schema_version ?? null,
    activeStage: loaded.state?.active_stage ?? null,
    source: source ? formatSummary(source.payload, source.format) : null,
    validation: summarizeValidation(model)
  });
}
async function commandUnpack(args, options) {
  exactArgs("unpack", args, 1);
  const artifact = await loadArtifact(args[0]);
  if (artifact.format === Format.PROJECT) throw unsupportedError("unpack 输入必须是 JSON 或 PNG 制品，不能是项目目录");
  const repairableIssues = artifact.validation.issues.filter((candidate) => candidate.rule === "character_book.binding");
  artifact.validation.issues = artifact.validation.issues.filter((candidate) => candidate.rule !== "character_book.binding");
  if (artifact.validation.issues.length > 0) {
    throw validationError("输入制品未通过结构校验", artifact.validation);
  }
  const defaultName = path.basename(artifact.path, path.extname(artifact.path));
  const displayName = artifact.payload?.data?.name || artifact.payload?.name || defaultName;
  const outputRoot = path.resolve(options.output ?? path.join(path.dirname(artifact.path), `${defaultName}.rp-card`));
  const target = artifact.format === Format.WORLDBOOK ? "worldbook" : "character_card";
  const project = makeProject({
    name: displayName,
    target,
    nsfw: parseNsfwOption(options, "unpack"),
    operation: "convert"
  });
  const preserved = collectPreserved(artifact.payload, artifact.format);
  const sourcePath = projectSourcePath(project);
  const preservedPath = "src/import/preserved.json";
  const originalJsonPath = "src/import/original.json";
  const semanticSource = artifact.format === Format.WORLDBOOK ? worldSourceFromBook(artifact.payload) : characterSourceFromCard(artifact.payload);
  const nsfwSources = await applyNsfwTemplates(project, semanticSource);
  addPreservedImport(project, preservedPath);
  addPreservedImport(project, originalJsonPath);
  project.materials.push({
    id: "input_artifact",
    path: isPngCharacterFormat(artifact.format) ? "src/import/original.png" : originalJsonPath,
    kind: isPngCharacterFormat(artifact.format) ? "character_card_png" : artifact.format === Format.WORLDBOOK ? "worldbook" : "character_card_json",
    read_only: true
  });
  if (isPngCharacterFormat(artifact.format)) {
    addPreservedImport(project, "src/import/original.png");
    project.deliverables = ["character_card_json", "character_card_png"];
  }
  const state = makeState(project, { revision: 1 });
  state.dirty_sources = [sourcePath];
  const files = [
    { relativePath: PROJECT_FILE, content: stringifyYaml(project) },
    { relativePath: STATE_FILE, content: prettyJson(state) },
    { relativePath: "src/positioning.yaml", content: stringifyYaml(defaultPositioning()) },
    { relativePath: sourcePath, content: stringifyYaml(semanticSource) },
    ...nsfwSources.uiSource ? [{ relativePath: "src/ui/status-ui.yaml", content: stringifyYaml(nsfwSources.uiSource) }] : [],
    { relativePath: originalJsonPath, content: prettyJson(artifact.payload) },
    { relativePath: preservedPath, content: prettyJson(preserved) }
  ];
  if (isPngCharacterFormat(artifact.format)) {
    files.push({ relativePath: "src/import/original.png", content: artifact.buffer });
  }
  const candidateValidation = validateProjectModel(project, state, outputRoot);
  candidateValidation.issues.push(...validateNamedSchema("positioning", defaultPositioning(), "/src/positioning.yaml"));
  candidateValidation.issues.push(...validateNamedSchema(
    artifact.format === Format.WORLDBOOK ? "world" : "character",
    semanticSource,
    `/${sourcePath}`
  ));
  if (nsfwSources.uiSource) {
    candidateValidation.issues.push(...validateNamedSchema("status-ui", nsfwSources.uiSource, "/src/ui/status-ui.yaml"));
  }
  if (candidateValidation.issues.length > 0) {
    throw validationError("解包候选未通过内置 Schema", candidateValidation);
  }
  const result = await commitNewDirectory(outputRoot, files, {
    force: Boolean(options.force),
    dryRun: Boolean(options["dry-run"])
  });
  return successReport("unpack", {
    projectRoot: outputRoot,
    sourceFormat: artifact.format,
    preservedUnknownFields: preserved.entries.length,
    originalDigest: artifact.digest,
    dryRun: result.dryRun
  }, [
    ...artifact.validation.warnings,
    ...repairableIssues,
  ].map((candidate) => candidate.message), result.changes);
}
async function commandValidate(args, options) {
  exactArgs("validate", args, 1);
  const artifact = await loadArtifact(args[0]);
  if (artifact.format === Format.PROJECT) {
    return runProjectMutation(artifact.projectRoot, async () => {
      const loaded = await loadProject(artifact.projectRoot, { allowLegacy: true });
      const result2 = await validateLoadedProject(loaded);
      const reportData2 = validationReportData(result2);
      const output = path.resolve(options.output ?? path.join(loaded.projectRoot, "reports", "validation.json"));
      assertOutputDoesNotOverwriteSource(output, projectProtectedPaths(loaded));
      await planWrites([{ path: output, content: prettyJson(reportData2) }], { force: Boolean(options.force) });
      const nextState = structuredClone(loaded.state);
      const validationStatus = result2.issues.length > 0 ? "fail" : result2.warnings.length > 0 ? "warning" : "pass";
      nextState.revision += 1;
      nextState.validation = isPlainObject(nextState.validation) ? nextState.validation : { status: "not_run", runs: [] };
      nextState.validation.runs = Array.isArray(nextState.validation.runs) ? nextState.validation.runs : [];
      nextState.validation.status = validationStatus;
      nextState.validation.runs.push({
        id: `validation_${nextState.revision}`,
        evidence_level: "offline",
        status: validationStatus,
        report: relativeOrAbsolute(loaded.projectRoot, output)
      });
      nextState.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      const stateIssues = validateNamedSchema("state", nextState, `/${STATE_FILE}`);
      if (stateIssues.length > 0) throw validationError("校验运行记录未通过状态 Schema", { issues: stateIssues });
      const commit = await commitWrites([
        { path: output, content: prettyJson(reportData2) },
        { path: loaded.statePath, content: prettyJson(nextState) }
      ], { force: true, dryRun: Boolean(options["dry-run"]) });
      if (result2.issues.length > 0) throw validationError("校验失败", reportData2);
      return successReport(
        "validate",
        reportData2,
        result2.warnings.map((warning) => warning.message),
        commit.changes
      );
    }, { force: Boolean(options.force), dryRun: Boolean(options["dry-run"]) });
  }
  const result = {
    subject: artifact.path,
    format: artifact.format,
    issues: artifact.validation.issues,
    warnings: artifact.validation.warnings,
    checks: artifactChecks(artifact)
  };
  const reportData = validationReportData(result);
  const changes = [];
  if (options.output) {
    const output = path.resolve(options.output);
    assertOutputDoesNotOverwriteSource(output, [artifact.path]);
    const commit = await commitWrites([{ path: output, content: prettyJson(reportData) }], {
      force: Boolean(options.force),
      dryRun: Boolean(options["dry-run"])
    });
    changes.push(...commit.changes);
  }
  if (result.issues.length > 0) {
    throw validationError("校验失败", reportData);
  }
  return successReport("validate", reportData, result.warnings.map((warning) => warning.message), changes);
}
async function validateLoadedProject(loaded) {
  const model = validateProjectModel(loaded.project, loaded.state, loaded.projectRoot);
  const checks = [];
  const registered = await validateRegisteredSources(loaded);
  model.issues.push(...registered.issues);
  checks.push(check(
    "source_manifest.schemas",
    registered.issues.length === 0 ? "pass" : "fail",
    "blocker",
    "offline",
    registered.checks.map((entry) => `${entry.schema}:${entry.path}`)
  ));
  try {
    const runtimeSources = await readRegisteredSources(loaded);
    const runtimeValidation = await validateRuntimeSources({
      project: loaded.project,
      state: loaded.state,
      sources: runtimeSources,
      projectRoot: loaded.projectRoot
    });
    model.issues.push(...runtimeValidation.issues);
    model.warnings.push(...runtimeValidation.warnings);
    checks.push(check(
      "source.runtime_graph",
      runtimeValidation.issues.length === 0 ? "pass" : "fail",
      "blocker",
      "offline",
      runtimeValidation.issues.map((entry) => `${entry.rule}:${entry.path}`)
    ));
  } catch (error) {
    model.issues.push({ path: "/source_manifest", rule: "mvu.reference", message: error.message });
    checks.push(check("source.runtime_graph", "fail", "blocker", "offline", [error.message]));
  }
  let source;
  try {
    source = await loadProjectSource(loaded);
    model.issues.push(...source.validation.issues);
    model.warnings.push(...source.validation.warnings);
    checks.push(check("source.parse", source.validation.issues.length === 0 ? "pass" : "fail", "blocker", "offline", [source.sourcePath]));
    if (source.restoredPaths.length > 0) {
      model.warnings.push({
        path: "/source_manifest/preserved_imports",
        rule: "restored",
        message: `构建时恢复了 ${source.restoredPaths.length} 个未知字段`
      });
    }
  } catch (error) {
    model.issues.push({ path: "/source_manifest", rule: "read", message: error.message });
    checks.push(check("source.parse", "fail", "blocker", "offline", [error.message]));
  }
  const pngBase = projectPngBasePath(loaded.project);
  if (pngBase) {
    try {
      const pngPath = resolveWithin(loaded.projectRoot, pngBase);
      parsePng(await readFile(pngPath), pngPath);
      checks.push(check("png.base.integrity", "pass", "blocker", "artifact", [pngPath]));
    } catch (error) {
      model.issues.push({ path: "/source_manifest/preserved_imports", rule: "integrity", message: error.message });
      checks.push(check("png.base.integrity", "fail", "blocker", "artifact", [error.message]));
    }
  } else {
    checks.push(check("png.base.integrity", "not_run", "info", "artifact", ["项目未配置 PNG 基底"]));
  }
  checks.push(check(
    "project.contract",
    model.issues.length === 0 ? "pass" : "fail",
    "blocker",
    "offline",
    [loaded.projectPath, loaded.statePath]
  ));
  checks.push(check("runtime.sillytavern", "not_run", "info", "runtime", ["需在用户的 SillyTavern 环境中验收"]));
  return {
    subject: loaded.projectRoot,
    format: Format.PROJECT,
    projectId: loaded.project?.project?.id ?? null,
    sourceRevision: loaded.state?.revision ?? null,
    issues: model.issues,
    warnings: model.warnings,
    checks,
    source
  };
}
async function commandBuild(args, options) {
  exactArgs("build", args, 1);
  return buildOrPack("build", args[0], options, false);
}
async function commandPack(args, options) {
  exactArgs("pack", args, 1);
  return buildOrPack("pack", args[0], options, true);
}
async function buildOrPack(command, root, options, allowPng) {
  return runProjectMutation(root, async () => {
    const loaded = await loadProject(root);
    const projectValidation = validateProjectModel(loaded.project, loaded.state, loaded.projectRoot);
    const registered = await validateRegisteredSources(loaded);
    projectValidation.issues.push(...registered.issues);
    if (registered.issues.length === 0) {
      const runtimeSources = await readRegisteredSources(loaded);
      const runtimeValidation = await validateRuntimeSources({
        project: loaded.project,
        state: loaded.state,
        sources: runtimeSources,
        projectRoot: loaded.projectRoot
      });
      projectValidation.issues.push(...runtimeValidation.issues);
      projectValidation.warnings.push(...runtimeValidation.warnings);
    }
    if (projectValidation.issues.length > 0) throw validationError("项目状态无效", projectValidation);
    const source = await loadProjectSource(loaded);
    assertValidSource(source);
    const configured = projectOutputPaths(loaded.project);
    const pngBase = projectPngBasePath(loaded.project);
    let outputPath;
    let outputFormat;
    let outputBuffer;
    let pngEvidence = null;
    if (allowPng && (options.output?.toLowerCase().endsWith(".png") || !options.output && pngBase)) {
      if (projectTarget(loaded.project) === "worldbook") throw unsupportedError("独立世界书不能打包为角色卡 PNG");
      const base = await readOriginalPng(loaded);
      outputPath = path.resolve(options.output ?? resolveWithin(loaded.projectRoot, configured.png));
      assertOutputDoesNotOverwriteSource(outputPath, projectProtectedPaths(loaded));
      const before = parsePng(base.buffer, base.pngPath);
      outputBuffer = embedCardInPng(base.buffer, source.payload, base.pngPath);
      const after = parsePng(outputBuffer, `${outputPath} 候选`);
      const embedded = extractCardFromPng(outputBuffer, `${outputPath} 候选`);
      pngEvidence = {
        selectedKeyword: embedded.selectedKeyword,
        charaChunks: embedded.charaChunks,
        ccv3Chunks: embedded.ccv3Chunks,
        encoding: { chunk: "tEXt", payload: "base64", decoded: "utf8-json" },
        nonCardDigestBefore: nonCardChunkDigest(before.chunks),
        nonCardDigestAfter: nonCardChunkDigest(after.chunks)
      };
      outputFormat = Format.PNG_CHARACTER_V3;
    } else {
      outputPath = path.resolve(options.output ?? resolveWithin(loaded.projectRoot, configured.json));
      assertOutputDoesNotOverwriteSource(outputPath, projectProtectedPaths(loaded));
      outputBuffer = Buffer.from(prettyJson(source.payload), "utf8");
      outputFormat = source.format;
    }
    const runtimeSchemaPath = path.join(loaded.projectRoot, "reports", "runtime-state.schema.json");
    const hasRuntimeSchema = Boolean(source.runtimeStateSchema);
    const runtimeSchemaContent = source.runtimeStateSchema ? prettyJson(source.runtimeStateSchema) : null;
    const runtimeSchemaEntry = hasRuntimeSchema
      ? { path: runtimeSchemaPath, content: runtimeSchemaContent }
      : { path: runtimeSchemaPath, delete: true };
    const manifestPath = path.join(loaded.projectRoot, "reports", "build-manifest.json");
    const protectedPaths = projectProtectedPaths(loaded);
    assertOutputDoesNotOverwriteSource(runtimeSchemaPath, protectedPaths);
    assertOutputDoesNotOverwriteSource(manifestPath, protectedPaths);
    assertDistinctWriteTargets([outputPath, runtimeSchemaPath, manifestPath]);
    await planWrites([
      { path: outputPath, content: outputBuffer },
      runtimeSchemaEntry
    ], { force: Boolean(options.force) });
    const artifactDigest = sha256(outputBuffer);
    const sourceDigest = sha256(prettyJson(source.payload));
    const relativeOutput = relativeOrAbsolute(loaded.projectRoot, outputPath);
    const effectiveCardPayload = isCharacterFormat(source.format) ? isPngCharacterFormat(outputFormat) ? ccv3Payload(source.payload) : source.payload : null;
    const manifest = {
      schema_version: "1.0.0",
      project_id: loaded.project.project.id,
      source_revision: loaded.state.revision,
      source: projectSourcePath(loaded.project),
      consumed_sources: source.consumedSources,
      source_digest: sourceDigest,
      output: relativeOutput,
      output_format: outputFormat,
      ...effectiveCardPayload ? {
        card_spec: effectiveCardPayload.spec,
        card_spec_version: effectiveCardPayload.spec_version
      } : {},
      artifact_digest: artifactDigest,
      preserved_unknown_fields: source.restoredPaths,
      runtime_state_schema: hasRuntimeSchema ? {
        path: relativeOrAbsolute(loaded.projectRoot, runtimeSchemaPath),
        digest: sha256(runtimeSchemaContent)
      } : null,
      ...pngEvidence ? { png: pngEvidence } : {}
    };
    const nextState = structuredClone(loaded.state);
    const nextProject = structuredClone(loaded.project);
    nextProject.release.outputs = [.../* @__PURE__ */ new Set([...nextProject.release.outputs ?? [], relativeOutput])];
    const finishedAt = (/* @__PURE__ */ new Date()).toISOString();
    const sourceRevision = nextState.revision;
    nextState.revision += 1;
    nextState.dirty_sources = [];
    nextState.last_build = {
      id: `${command}_${nextState.revision}`,
      source_revision: sourceRevision,
      status: "pass",
      finished_at: finishedAt,
      manifest: "reports/build-manifest.json"
    };
    nextState.transaction = null;
    nextState.updated_at = finishedAt;
    const nextModel = validateProjectModel(nextProject, nextState, loaded.projectRoot);
    if (nextModel.issues.length > 0) throw validationError("构建后的项目与技术状态未通过 Schema", nextModel);
    const commit = await commitWrites([
      { path: outputPath, content: outputBuffer },
      { path: manifestPath, content: prettyJson(manifest) },
      runtimeSchemaEntry,
      { path: loaded.projectPath, content: stringifyYaml(nextProject) },
      { path: loaded.statePath, content: prettyJson(nextState) }
    ], {
      force: true,
      dryRun: Boolean(options["dry-run"])
    });
    return successReport(command, {
      projectRoot: loaded.projectRoot,
      output: outputPath,
      format: outputFormat,
      sourceDigest,
      artifactDigest,
      runtimeStateSchema: hasRuntimeSchema ? runtimeSchemaPath : null,
      preservedUnknownFieldsRestored: source.restoredPaths,
      png: pngEvidence,
      dryRun: Boolean(options["dry-run"])
    }, projectValidation.warnings.map((warning) => warning.message), commit.changes);
  }, { force: Boolean(options.force), dryRun: Boolean(options["dry-run"]) });
}
async function commandDiff(args) {
  exactArgs("diff", args, 2);
  const [left, right] = await Promise.all(args.map(loadComparable));
  const differences = diffValues(left.payload, right.payload);
  return successReport("diff", {
    equal: differences.length === 0,
    left: { path: left.path, format: left.format },
    right: { path: right.path, format: right.format },
    differences
  });
}
async function commandRoundtrip(args, options) {
  exactArgs("roundtrip", args, 1);
  const comparable = await loadComparable(args[0], { includeBinary: true });
  let candidate;
  let pngEvidence = null;
  if (isPngCharacterFormat(comparable.format)) {
    const parsedBefore = parsePng(comparable.buffer, comparable.path);
    candidate = embedCardInPng(comparable.buffer, comparable.payload, comparable.path);
    const extracted = extractCardFromPng(candidate, "roundtrip PNG 候选");
    const parsedAfter = parsePng(candidate, "roundtrip PNG 候选");
    pngEvidence = {
      nonCardDigestBefore: nonCardChunkDigest(parsedBefore.chunks),
      nonCardDigestAfter: nonCardChunkDigest(parsedAfter.chunks),
      imageDataUnchanged: nonCardChunkDigest(parsedBefore.chunks) === nonCardChunkDigest(parsedAfter.chunks)
    };
    if (!semanticEqual(ccv3Payload(comparable.payload), extracted.payload) || !pngEvidence.imageDataUnchanged) {
      throw integrityError("PNG 往返不一致", { png: pngEvidence });
    }
  } else if (comparable.project) {
    if (projectPngBasePath(comparable.project.project)) {
      const base = await readOriginalPng(comparable.project);
      candidate = embedCardInPng(base.buffer, comparable.payload, base.pngPath);
      const extracted = extractCardFromPng(candidate, "roundtrip 项目 PNG 候选");
      const before = parsePng(base.buffer, base.pngPath);
      const after = parsePng(candidate, "roundtrip 项目 PNG 候选");
      pngEvidence = {
        nonCardDigestBefore: nonCardChunkDigest(before.chunks),
        nonCardDigestAfter: nonCardChunkDigest(after.chunks),
        imageDataUnchanged: nonCardChunkDigest(before.chunks) === nonCardChunkDigest(after.chunks)
      };
      if (!semanticEqual(ccv3Payload(comparable.payload), extracted.payload) || !pngEvidence.imageDataUnchanged) {
        throw integrityError("项目 PNG 往返不一致", { png: pngEvidence });
      }
    } else {
      candidate = Buffer.from(prettyJson(comparable.payload));
      const reparsed = parseJsonText(candidate.toString("utf8"), "roundtrip JSON 候选");
      if (!semanticEqual(comparable.payload, reparsed)) throw integrityError("项目 JSON 往返不一致");
    }
  } else {
    candidate = Buffer.from(prettyJson(comparable.payload));
    const reparsed = parseJsonText(candidate.toString("utf8"), "roundtrip JSON 候选");
    if (!semanticEqual(comparable.payload, reparsed)) throw integrityError("JSON 往返不一致");
  }
  const changes = [];
  if (options.output) {
    const outputPath = path.resolve(options.output);
    const protectedPaths = comparable.project ? projectProtectedPaths(comparable.project) : [comparable.path];
    assertOutputDoesNotOverwriteSource(outputPath, protectedPaths);
    const commit = await commitWrites([{ path: outputPath, content: candidate }], {
      force: Boolean(options.force),
      dryRun: Boolean(options["dry-run"])
    });
    changes.push(...commit.changes);
  }
  return successReport("roundtrip", {
    equal: true,
    subject: comparable.path,
    format: comparable.format,
    payloadDigest: sha256(prettyJson(comparable.payload)),
    candidateDigest: sha256(candidate),
    png: pngEvidence,
    dryRun: Boolean(options["dry-run"])
  }, [], changes);
}
async function commandState(args, options) {
  if (args.length < 1) throw inputError("state 至少需要项目目录");
  const root = args[0];
  const action = args[1] ?? "show";
  if (action === "show") {
    exactArgs("state show", args, 1, 2);
    const loaded = await loadProject(root, { allowLegacy: true });
    return successReport("state", {
      projectRoot: loaded.projectRoot,
      projectId: loaded.project?.project?.id ?? null,
      projectSchemaVersion: loaded.project?.schema_version ?? null,
      stateSchemaVersion: loaded.state?.schema_version ?? null,
      revision: loaded.state?.revision ?? null,
      activeStage: loaded.state?.active_stage ?? null,
      stages: loaded.state?.stages ?? null,
      decisions: loaded.project?.decisions ?? [],
      decisionLocks: loaded.state?.decision_locks ?? []
    });
  }
  return runProjectMutation(root, async () => {
    const loaded = await loadProject(root, { allowLegacy: true });
    if (action === "migrate") {
      exactArgs("state migrate", args, 2);
      const projectMigration = migrateProject(loaded.project);
      const stateMigration = migrateState(loaded.state, projectMigration.value);
      if (projectMigration.migrated || stateMigration.migrated) {
        stateMigration.value.revision = Number(stateMigration.value.revision ?? 0) + 1;
        stateMigration.value.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      }
      const model2 = validateProjectModel(projectMigration.value, stateMigration.value, loaded.projectRoot);
      if (model2.issues.length > 0) throw validationError("迁移结果未通过 Schema", model2);
      const commit2 = await updateProjectAndState(loaded, projectMigration.value, stateMigration.value, {
        dryRun: Boolean(options["dry-run"])
      });
      return successReport("state", {
        action,
        projectMigrated: projectMigration.migrated,
        stateMigrated: stateMigration.migrated,
        dryRun: Boolean(options["dry-run"])
      }, [], commit2.changes);
    }
    if (loaded.project.schema_version !== PROJECT_SCHEMA_VERSION || loaded.state.schema_version !== STATE_SCHEMA_VERSION) {
      throw validationError("执行状态操作前必须先迁移项目", { hint: `state ${root} migrate` });
    }
    const nextProject = structuredClone(loaded.project);
    const nextState = structuredClone(loaded.state);
    let projectChanged = false;
    if (action === "lock") {
      exactArgs("state lock", args, 4, 4);
      const [, , id, rawValue] = args;
      assertDecisionId(id);
      const value = parseCliValue(rawValue);
      const source = options.source ?? "user";
      if (!["user", "delegated"].includes(source)) throw inputError(`state lock --source 仅支持 user 或 delegated，收到: ${source}`);
      if (source === "delegated" && (!options.rationale || options.rationale.trim() === "")) {
        throw inputError("delegated 决定必须通过 --rationale 记录授权后的选择理由");
      }
      const decidedBy = source === "delegated" ? "ai_delegation" : "user";
      const rationale = options.rationale?.trim() || "用户通过 Forge state lock 明确锁定";
      const existingIndex = nextProject.decisions.findIndex((entry) => entry.id === id);
      if (existingIndex !== -1) {
        const existing = nextProject.decisions[existingIndex];
        const technicalLock = nextState.decision_locks.find((entry) => entry.decision_id === id);
        if (existing.locked && existing.status === "active" && compareLockValue(decisionValue(existing), value)) {
          if (technicalLock) return successReport("state", { action, id, unchanged: true });
          nextState.decision_locks.push(decisionLock(existing));
        } else {
          if (existing.locked && existing.status === "active" && !options.force) {
            throw conflictError(`锁 ${id} 已存在且值不同`, { existing: decisionValue(existing), requested: value });
          }
          existing.history ??= [];
          existing.history.push({
            value: structuredClone(existing.value),
            decided_by: existing.decided_by,
            rationale: existing.rationale,
            superseded_at: (/* @__PURE__ */ new Date()).toISOString()
          });
          Object.assign(existing, {
            stage: nextState.active_stage,
            summary: `${id} = ${JSON.stringify(value)}`,
            value,
            decided_by: decidedBy,
            locked: true,
            status: "active",
            rationale,
            round: nextState.stages[nextState.active_stage].round
          });
        }
      } else {
        nextProject.decisions.push({
          id,
          stage: nextState.active_stage,
          summary: `${id} = ${JSON.stringify(value)}`,
          value,
          decided_by: decidedBy,
          locked: true,
          status: "active",
          rationale,
          round: nextState.stages[nextState.active_stage].round,
          history: []
        });
      }
      const decision = nextProject.decisions.find((entry) => entry.id === id);
      nextState.decision_locks = nextState.decision_locks.filter((entry) => entry.decision_id !== id);
      nextState.decision_locks.push(decisionLock(decision));
      projectChanged = true;
    } else if (action === "unlock") {
      exactArgs("state unlock", args, 3);
      const id = args[2];
      assertDecisionId(id);
      const decision = nextProject.decisions.find((entry) => entry.id === id);
      if (!decision || !decision.locked) return successReport("state", { action, id, unchanged: true });
      decision.locked = false;
      decision.status = "superseded";
      nextState.decision_locks = nextState.decision_locks.filter((entry) => entry.decision_id !== id);
      projectChanged = true;
    } else if (action === "stage") {
      exactArgs("state stage", args, 3, 4);
      const stage = args[2];
      const status = args[3] ?? "in_progress";
      if (!STAGES.includes(stage)) throw inputError(`未知阶段: ${stage}`, { supported: STAGES });
      if (!STAGE_STATUSES.includes(status)) {
        throw inputError(`未知阶段 status: ${status}`, { supported: STAGE_STATUSES });
      }
      if (status === "skipped" && !loaded.project.workflow.optional_stages.includes(stage)) {
        throw conflictError(`必经阶段不能标记为 skipped: ${stage}`);
      }
      if (["complete", "skipped"].includes(status) && (!options.summary || options.summary.trim() === "")) {
        throw inputError(`state stage ${stage} ${status} 必须通过 --summary 记录阶段总汇或跳过理由`);
      }
      const previous = nextState.active_stage;
      if (previous !== stage && !options.force) {
        if (!["complete", "skipped"].includes(nextState.stages[previous].status)) {
          throw conflictError(`切换阶段前必须先完成或跳过当前阶段 ${previous}`, {
            currentStatus: nextState.stages[previous].status
          });
        }
        if (!nextState.stages[previous].summary) {
          throw conflictError(`切换阶段前必须为 ${previous} 记录阶段摘要`);
        }
      }
      const previousIndex = STAGES.indexOf(previous);
      const nextIndex = STAGES.indexOf(stage);
      if (nextIndex > previousIndex + 1 && !options.force) {
        const unresolved = STAGES.slice(previousIndex + 1, nextIndex).filter((entry) => !["complete", "skipped"].includes(nextState.stages[entry].status) || !nextState.stages[entry].summary);
        if (unresolved.length > 0) throw conflictError("不能越过未完成或未跳过的阶段", { unresolved });
      }
      if (status === "in_progress" && nextState.stages[stage].status !== "in_progress") {
        nextState.stages[stage].round += 1;
      }
      nextState.active_stage = stage;
      nextState.stages[stage].status = status;
      if (options.summary) nextState.stages[stage].summary = options.summary.trim();
    } else {
      throw unsupportedError(`未知 state action: ${action}`);
    }
    nextState.revision += 1;
    nextState.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    const model = validateProjectModel(nextProject, nextState, loaded.projectRoot);
    if (model.issues.length > 0) throw validationError("状态更新未通过 Schema", model);
    const commit = await (projectChanged ? updateProjectAndState : updateManagedState)(loaded, ...projectChanged ? [nextProject, nextState, { dryRun: Boolean(options["dry-run"]) }] : [nextState, { dryRun: Boolean(options["dry-run"]) }]);
    return successReport("state", {
      action,
      revision: nextState.revision,
      activeStage: nextState.active_stage,
      stageStatus: nextState.stages[nextState.active_stage].status,
      decisionLocks: nextState.decision_locks,
      dryRun: Boolean(options["dry-run"])
    }, [], commit.changes);
  }, { force: Boolean(options.force), dryRun: Boolean(options["dry-run"]) });
}
async function commandDoctor(args) {
  exactArgs("doctor", args, 0, 1);
  const major = Number(process.versions.node.split(".")[0]);
  const checks = [
    doctorCheck("node.version", major >= 20, `Node ${process.versions.node}`, "需要 Node.js 20+"),
    doctorCheck("runtime.utf8", Buffer.from("中文", "utf8").toString("utf8") === "中文", "UTF-8 正常", "UTF-8 异常"),
    doctorCheck("runtime.platform", true, `${process.platform}/${process.arch}`, "")
  ];
  let project = null;
  if (args[0]) {
    try {
      const loaded = await loadProject(args[0], { allowLegacy: true });
      const validated = await validateLoadedProject(loaded);
      project = validationReportData(validated);
      checks.push(doctorCheck("project.health", validated.issues.length === 0, "项目结构可用", "项目存在阻断错误"));
    } catch (error) {
      checks.push(doctorCheck("project.health", false, "", error.message));
    }
  }
  const ok = checks.every((entry) => entry.status === "pass");
  if (!ok) throw validationError("doctor 检查未通过", { checks, project });
  return successReport("doctor", {
    node: process.versions.node,
    platform: process.platform,
    architecture: process.arch,
    temporaryDirectory: os.tmpdir(),
    checks,
    project
  });
}
async function loadComparable(input, { includeBinary = false } = {}) {
  const artifact = await loadArtifact(input);
  if (artifact.format !== Format.PROJECT) {
    if (artifact.validation.issues.length > 0) throw validationError("比较输入未通过结构校验", artifact.validation);
    return {
      path: artifact.path,
      format: artifact.format,
      payload: artifact.payload,
      ...includeBinary ? { buffer: artifact.buffer } : {}
    };
  }
  const loaded = await loadProject(artifact.projectRoot);
  const model = validateProjectModel(loaded.project, loaded.state, loaded.projectRoot);
  const registered = await validateRegisteredSources(loaded);
  model.issues.push(...registered.issues);
  if (model.issues.length > 0) throw validationError("项目未通过结构与源码 Schema 校验", model);
  const source = await loadProjectSource(loaded);
  assertValidSource(source);
  return {
    path: loaded.projectRoot,
    format: Format.PROJECT,
    payload: source.payload,
    project: loaded
  };
}
function artifactChecks(artifact) {
  const checks = [check(
    "artifact.structure",
    artifact.validation.issues.length === 0 ? "pass" : "fail",
    "blocker",
    "artifact",
    [artifact.path]
  )];
  if (isPngCharacterFormat(artifact.format)) {
    checks.push(check("artifact.png_crc", "pass", "blocker", "artifact", [artifact.digest]));
    const unique = artifact.png.charaChunks <= 1 && artifact.png.ccv3Chunks <= 1;
    checks.push(check("artifact.png_card_blocks_unique", unique ? "pass" : "fail", "blocker", "artifact", [
      `chara=${artifact.png.charaChunks}`,
      `ccv3=${artifact.png.ccv3Chunks}`
    ]));
    checks.push(check("artifact.png_selected_keyword", "pass", "blocker", "artifact", [artifact.png.selectedKeyword]));
  }
  checks.push(check("runtime.sillytavern", "not_run", "info", "runtime", ["离线校验不能代替真实 SillyTavern 验收"]));
  return checks;
}
function validationReportData(result) {
  const blockers = result.issues.length;
  return {
    schema_version: "1.0.0",
    subject: result.subject,
    format: result.format,
    project_id: result.projectId ?? null,
    source_revision: result.sourceRevision ?? null,
    summary: { blockers, warnings: result.warnings.length },
    issues: result.issues,
    warnings: result.warnings,
    checks: result.checks,
    runtime: {
      status: "not_run",
      reason: "尚未在目标 SillyTavern 中执行"
    }
  };
}
function parseNsfwOption(options, command) {
  if (options.nsfw === "enabled") return true;
  if (options.nsfw === "disabled") return false;
  throw inputError(`${command} 必须显式提供 --nsfw enabled 或 --nsfw disabled`);
}
function check(id, status, severity, evidenceLevel, evidence) {
  return { id, status, severity, evidence_level: evidenceLevel, evidence };
}
function doctorCheck(id, passed, evidence, failure) {
  return { id, status: passed ? "pass" : "fail", evidence: passed ? evidence : failure };
}
function summarizeValidation(validation) {
  return {
    valid: validation.issues.length === 0,
    blockers: validation.issues.length,
    warnings: validation.warnings.length
  };
}
function relativeOrAbsolute(root, target) {
  const relative = path.relative(root, target);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) return relative.replaceAll(path.sep, "/");
  return target;
}
function assertOutputDoesNotOverwriteSource(output, sources) {
  const resolvedOutput = comparablePath(output);
  for (const source of sources.filter(Boolean)) {
    if (resolvedOutput === comparablePath(source)) {
      throw conflictError(`输出不能覆盖维护源码、技术状态或原始输入: ${path.resolve(output)}`);
    }
  }
}
function assertDistinctWriteTargets(targets) {
  const seen = new Map();
  for (const target of targets.filter(Boolean)) {
    const comparable = comparablePath(target);
    if (seen.has(comparable)) {
      throw conflictError(`构建写入目标不能重复: ${path.resolve(target)}`);
    }
    seen.set(comparable, target);
  }
}
function projectProtectedPaths(loaded) {
  const manifestPaths = Object.values(loaded.project?.source_manifest ?? {}).flatMap((entries) => Array.isArray(entries) ? entries : []).flatMap((entry) => {
    try {
      return [resolveWithin(loaded.projectRoot, entry)];
    } catch {
      return [];
    }
  });
  return [loaded.projectPath, loaded.statePath, ...manifestPaths];
}
function comparablePath(target) {
  const resolved = path.resolve(target);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
function parseCliValue(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
function exactArgs(command, args, minimum, maximum = minimum) {
  if (args.length < minimum || args.length > maximum) {
    const expected = minimum === maximum ? `${minimum}` : `${minimum}-${maximum}`;
    throw inputError(`${command} 需要 ${expected} 个位置参数，收到 ${args.length} 个`);
  }
}
function diffValues(left, right, pointer = "") {
  if (semanticEqual(left, right)) return [];
  if (Array.isArray(left) && Array.isArray(right)) {
    const output = [];
    const maximum = Math.max(left.length, right.length);
    for (let index = 0; index < maximum; index += 1) {
      const next = `${pointer}/${index}`;
      if (index >= left.length) output.push({ path: next, change: "added", after: right[index] });
      else if (index >= right.length) output.push({ path: next, change: "removed", before: left[index] });
      else output.push(...diffValues(left[index], right[index], next));
    }
    return output;
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const output = [];
    const keys = [.../* @__PURE__ */ new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      const next = `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
      if (!Object.hasOwn(left, key)) output.push({ path: next, change: "added", after: right[key] });
      else if (!Object.hasOwn(right, key)) output.push({ path: next, change: "removed", before: left[key] });
      else output.push(...diffValues(left[key], right[key], next));
    }
    return output;
  }
  return [{ path: pointer || "/", change: "changed", before: left, after: right }];
}
