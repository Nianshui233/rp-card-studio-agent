import { access, stat } from 'node:fs/promises';
import path from 'node:path';

import { validationError } from './errors.mjs';

/**
 * Formal Forge lifecycle hooks.
 *
 * Hooks are intentionally small and deterministic. They are an extension
 * surface for the Agent's own lifecycle, not a second creative policy
 * engine. A hook may report pass/warn/block; only real integrity failures are
 * blocking by default.
 */
export const FORGE_HOOK_EVENTS = Object.freeze([
  'before_stage_write',
  'before_source_write',
  'before_build',
  'after_build',
  'after_delivery',
]);

const EVENT_INDEX = new Set(FORGE_HOOK_EVENTS);

function result(status, id, message, evidence = []) {
  return {
    status,
    id,
    message,
    evidence: Array.isArray(evidence) ? evidence : [evidence],
  };
}

function inside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function isDirectory(target) {
  try {
    return (await stat(target)).isDirectory();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

const REQUIRED_PACKAGE_FILES = Object.freeze([
  '00_导入说明.md',
  '01_项目清单.json',
  '08_验证报告.md',
]);

function builtInHandlers() {
  return {
    before_stage_write: [
      {
        id: 'forge.stage.lifecycle',
        run: ({ stage, status, summary, plannedStages = [] }) => {
          if (!stage || !status) return result('block', 'forge.stage.lifecycle', '阶段写入缺少 stage 或 status');
          if (!plannedStages.includes(stage) && status !== 'skipped' && stage !== 'preflight') {
            return result('block', 'forge.stage.lifecycle', `阶段 ${stage} 不在当前 planned_stages 中`, [stage]);
          }
          if (['complete', 'skipped'].includes(status) && !String(summary ?? '').trim()) {
            return result('block', 'forge.stage.lifecycle', `阶段 ${stage} 完成或跳过时必须有阶段总汇`, [stage, status]);
          }
          return result('pass', 'forge.stage.lifecycle', '阶段写入满足最小生命周期条件', [stage, status]);
        },
      },
      {
        id: 'forge.stage.handoff',
        run: ({ stage, status, project }) => {
          if (!['complete', 'skipped'].includes(status)) {
            return result('pass', 'forge.stage.handoff', '当前阶段尚未封存，不检查未决交接');
          }
          const pending = (project?.handoffs ?? [])
            .filter((handoff) => handoff?.source_stage === stage)
            .filter((handoff) => ['open', 'proposed', 'blocked'].includes(handoff?.status));
          if (pending.length > 0) {
            return result('warn', 'forge.stage.handoff', '阶段已准备封存，但仍有未处理的跨阶段交接；不会阻止创作，可在后续阶段继续处理', pending.map((handoff) => handoff.id ?? handoff.reason ?? '未命名交接'));
          }
          return result('pass', 'forge.stage.handoff', '阶段没有遗留的未处理交接');
        },
      },
    ],
    before_source_write: [
      {
        id: 'forge.source.boundary',
        run: ({ projectRoot, writes = [] }) => {
          if (!projectRoot) return result('block', 'forge.source.boundary', '源码写入缺少 projectRoot');
          const sourceWrites = writes.filter((entry) => entry?.role !== 'delivery');
          const outside = sourceWrites
            .map((entry) => entry?.path)
            .filter(Boolean)
            .filter((target) => !inside(projectRoot, target));
          if (outside.length > 0) {
            return result('block', 'forge.source.boundary', '写入目标越出项目工作区', outside);
          }
          return result('pass', 'forge.source.boundary', '源码与账本写入目标均位于项目工作区内', sourceWrites.map((entry) => entry?.path).filter(Boolean));
        },
      },
    ],
    before_build: [
      {
        id: 'forge.build.preflight',
        run: ({ validation }) => {
          const blockers = validation?.issues ?? [];
          if (blockers.length > 0) {
            return result('block', 'forge.build.preflight', '构建前仍存在项目阻断错误', blockers.map((issue) => issue?.path ?? issue?.message ?? 'unknown'));
          }
          return result('pass', 'forge.build.preflight', '构建前项目校验已通过');
        },
      },
    ],
    after_build: [
      {
        id: 'forge.build.artifact',
        run: ({ outputBuffer, artifactDigest, manifest }) => {
          if (!outputBuffer || outputBuffer.length === 0) {
            return result('block', 'forge.build.artifact', '构建产物为空');
          }
          if (manifest?.artifact_digest && manifest.artifact_digest !== artifactDigest) {
            return result('block', 'forge.build.artifact', '构建清单中的 artifact_digest 与实际产物不一致', [manifest.artifact_digest, artifactDigest]);
          }
          return result('pass', 'forge.build.artifact', '构建产物与清单摘要一致', [artifactDigest]);
        },
      },
      {
        id: 'forge.build.delivery_contract',
        run: ({ manifest }) => {
          if (!manifest || manifest.delivery_mode !== 'rp_project_package') {
            return result('block', 'forge.build.delivery_contract', '构建清单没有声明固定的多文件 RP 项目包交付模式', [manifest?.delivery_mode ?? null]);
          }
          const outputs = Array.isArray(manifest.outputs) ? manifest.outputs : [];
          const missing = REQUIRED_PACKAGE_FILES.filter((name) => !outputs.some((output) => output.endsWith(`/${name}`) || output === name));
          if (missing.length > 0) {
            return result('block', 'forge.build.delivery_contract', '项目包缺少固定交付所需的说明、清单或验证报告', missing);
          }
          return result('pass', 'forge.build.delivery_contract', '固定多文件项目包的核心交付文件已登记', REQUIRED_PACKAGE_FILES);
        },
      },
    ],
    after_delivery: [
      {
        id: 'forge.delivery.exists',
        run: async ({ outputPath, dryRun }) => {
          if (dryRun) return result('pass', 'forge.delivery.exists', 'dry-run 未执行实际交付写入');
          if (!outputPath || !await pathExists(outputPath)) {
            return result('warn', 'forge.delivery.exists', '交付命令已完成，但离线钩子未找到输出文件', [outputPath ?? null]);
          }
          return result('pass', 'forge.delivery.exists', '交付输出已落盘', [outputPath]);
        },
      },
      {
        id: 'forge.delivery.package_contract',
        run: async ({ outputPath, dryRun }) => {
          if (dryRun || !outputPath || !await isDirectory(outputPath)) {
            return result('pass', 'forge.delivery.package_contract', '未执行目录包巡检（dry-run 或输出尚未形成目录）');
          }
          const missing = [];
          for (const file of REQUIRED_PACKAGE_FILES) {
            if (!await pathExists(path.join(outputPath, file))) missing.push(file);
          }
          if (missing.length > 0) {
            return result('warn', 'forge.delivery.package_contract', '交付目录已生成，但固定项目包的部分说明文件未找到；请查看构建清单', missing);
          }
          return result('pass', 'forge.delivery.package_contract', '交付目录包含固定项目包的核心说明文件', REQUIRED_PACKAGE_FILES);
        },
      },
    ],
  };
}

/**
 * Create a per-command hook runner. Additional handlers can only be passed by
 * the current Agent process; project directories cannot inject arbitrary hook
 * scripts, keeping the core Agent self-contained.
 */
export function createForgeHookRunner({ projectRoot = null, handlers = {}, now = () => new Date().toISOString() } = {}) {
  const registry = new Map();
  const trace = [];
  const add = (event, id, run) => {
    if (!EVENT_INDEX.has(event)) throw new TypeError(`未知 Forge hook 事件: ${event}`);
    if (typeof run !== 'function') throw new TypeError(`Forge hook ${id} 必须是函数`);
    const list = registry.get(event) ?? [];
    list.push({ id, run });
    registry.set(event, list);
  };

  for (const [event, list] of Object.entries(builtInHandlers())) {
    for (const handler of list) add(event, handler.id, handler.run);
  }
  for (const event of FORGE_HOOK_EVENTS) {
    const custom = handlers[event];
    if (!custom) continue;
    for (const handler of Array.isArray(custom) ? custom : [custom]) {
      add(event, handler.id ?? `custom.${event}`, handler.run ?? handler);
    }
  }

  return {
    register(event, id, run) {
      add(event, id, run);
      return this;
    },
    async run(event, context = {}, { enforce = true } = {}) {
      if (!EVENT_INDEX.has(event)) throw new TypeError(`未知 Forge hook 事件: ${event}`);
      const payload = { ...context, projectRoot: context.projectRoot ?? projectRoot };
      const entries = registry.get(event) ?? [];
      const eventTrace = [];
      for (const handler of entries) {
        let entry;
        try {
          entry = await handler.run(payload);
        } catch (error) {
          entry = result('block', handler.id, `钩子执行失败: ${error.message}`, [error.stack ?? error.message]);
        }
        const normalized = {
          status: ['pass', 'warn', 'block'].includes(entry?.status) ? entry.status : 'pass',
          id: entry?.id ?? handler.id,
          message: entry?.message ?? '钩子完成',
          evidence: Array.isArray(entry?.evidence) ? entry.evidence : [],
        };
        eventTrace.push(normalized);
        trace.push({ event, ...normalized, at: now() });
        if (normalized.status === 'block' && enforce) {
          throw validationError(`Forge hook ${event} 阻断了当前操作: ${normalized.message}`, {
            hook: normalized.id,
            event,
            evidence: normalized.evidence,
          });
        }
      }
      return eventTrace;
    },
    snapshot() {
      return structuredClone(trace);
    },
  };
}
