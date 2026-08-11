import { conflictError, inputError } from './errors.mjs';

import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  unlink
} from "node:fs/promises";
import path from "node:path";
export async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
export async function isDirectory(target) {
  try {
    return (await stat(target)).isDirectory();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
function candidatePath(target, transactionId) {
  return path.join(path.dirname(target), `.${path.basename(target)}.${transactionId}.candidate`);
}
function backupPath(target, transactionId) {
  return path.join(path.dirname(target), `.${path.basename(target)}.${transactionId}.backup`);
}
async function writeCandidate(target, content, transactionId) {
  await mkdir(path.dirname(target), { recursive: true });
  const candidate = candidatePath(target, transactionId);
  const handle = await open(candidate, "wx");
  let failure = null;
  try {
    await handle.writeFile(content);
    await handle.sync();
  } catch (error) {
    failure = error;
  }
  try {
    await handle.close();
  } catch (error) {
    failure ??= error;
  }
  if (failure) {
    try {
      await unlink(candidate);
    } catch {
    }
    throw failure;
  }
  return candidate;
}
function normalizeContent(content) {
  return Buffer.isBuffer(content) ? content : Buffer.from(String(content), "utf8");
}
export async function planWrites(entries, { force = false } = {}) {
  const planned = [];
  for (const entry of entries) {
    if (entry.delete === true) {
      if (!await pathExists(entry.path)) {
        planned.push({ ...entry, action: "unchanged" });
        continue;
      }
      if (await isDirectory(entry.path)) throw conflictError(`拒绝将目录作为文件删除: ${entry.path}`);
      planned.push({ ...entry, action: "delete" });
      continue;
    }
    const content = normalizeContent(entry.content);
    if (!await pathExists(entry.path)) {
      planned.push({ ...entry, content, action: "create" });
      continue;
    }
    const current = await readFile(entry.path);
    if (current.equals(content)) {
      planned.push({ ...entry, content, action: "unchanged" });
      continue;
    }
    if (!force) {
      throw conflictError(`目标已存在且内容不同: ${entry.path}`, {
        path: entry.path,
        hint: "使用 --force 明确允许覆盖"
      });
    }
    planned.push({ ...entry, content, action: "replace" });
  }
  return planned;
}
export async function commitWrites(entries, options = {}) {
  const planned = await planWrites(entries, options);
  const changes = planned.map(({ path: target, action }) => ({ action, path: target }));
  if (options.dryRun || planned.every((entry) => entry.action === "unchanged")) {
    return { changes, dryRun: Boolean(options.dryRun) };
  }
  const transactionId = `${process.pid}-${randomUUID()}`;
  const staged = [];
  const committed = [];
  let commitComplete = false;
  try {
    for (const entry of planned) {
      if (entry.action === "unchanged") continue;
      staged.push({
        ...entry,
        candidate: entry.action === "delete" ? null : await writeCandidate(entry.path, entry.content, transactionId),
        backup: backupPath(entry.path, transactionId)
      });
    }
    for (const entry of staged) {
      const hadOriginal = entry.action === "replace" || entry.action === "delete";
      if (hadOriginal) await rename(entry.path, entry.backup);
      try {
        if (entry.action !== "delete") await rename(entry.candidate, entry.path);
      } catch (error) {
        if (hadOriginal && await pathExists(entry.backup)) await rename(entry.backup, entry.path);
        throw error;
      }
      committed.push({ ...entry, hadOriginal });
    }
    commitComplete = true;
    return { changes, dryRun: false };
  } catch (error) {
    for (const entry of [...committed].reverse()) {
      if (await pathExists(entry.path)) await unlink(entry.path);
      if (entry.hadOriginal && await pathExists(entry.backup)) await rename(entry.backup, entry.path);
    }
    throw error;
  } finally {
    for (const entry of staged) {
      try {
        if (entry.candidate && await pathExists(entry.candidate)) await unlink(entry.candidate);
      } catch {
      }
      try {
        if (commitComplete) {
          if (await pathExists(entry.backup)) await unlink(entry.backup);
        } else if (await pathExists(entry.backup) && !await pathExists(entry.path)) {
          await rename(entry.backup, entry.path);
        }
      } catch {
      }
    }
  }
}
export async function commitNewDirectory(root, files, options = {}) {
  const absoluteRoot = path.resolve(root);
  if (await pathExists(absoluteRoot)) {
    if (!await isDirectory(absoluteRoot)) {
      throw conflictError(`项目目标不是目录: ${absoluteRoot}`);
    }
    const entries = files.map(({ relativePath, content }) => ({
      path: resolveWithin(absoluteRoot, relativePath),
      content
    }));
    return commitWrites(entries, options);
  }
  const changes = files.map(({ relativePath }) => ({
    action: "create",
    path: resolveWithin(absoluteRoot, relativePath)
  }));
  if (options.dryRun) return { changes, dryRun: true };
  const candidateRoot = path.join(
    path.dirname(absoluteRoot),
    `.${path.basename(absoluteRoot)}.${process.pid}-${randomUUID()}.candidate`
  );
  await mkdir(path.dirname(absoluteRoot), { recursive: true });
  await mkdir(candidateRoot, { recursive: false });
  try {
    for (const file of files) {
      const target = resolveWithin(candidateRoot, file.relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      const handle = await open(target, "wx");
      try {
        await handle.writeFile(normalizeContent(file.content));
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    await rename(candidateRoot, absoluteRoot);
    return { changes, dryRun: false };
  } catch (error) {
    await rm(candidateRoot, { recursive: true, force: true });
    throw error;
  }
}
export function resolveWithin(root, relativePath) {
  if (path.isAbsolute(relativePath)) {
    throw inputError(`项目内路径必须是相对路径: ${relativePath}`);
  }
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absoluteRoot, relativePath);
  const relative = path.relative(absoluteRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw inputError(`项目内路径越界: ${relativePath}`);
  }
  return resolved;
}
export async function withProjectLock(projectRoot, callback, { force = false, dryRun = false } = {}) {
  if (dryRun) return callback();
  const lockPath = path.join(projectRoot, ".rp-card-forge.lock");
  await mkdir(projectRoot, { recursive: true });
  let handle;
  try {
    handle = await open(lockPath, force ? "w" : "wx");
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw conflictError(`项目正被另一个 Forge 写入: ${projectRoot}`, {
        lockPath,
        hint: "确认没有其它进程后可使用 --force"
      });
    }
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, acquiredAt: (/* @__PURE__ */ new Date()).toISOString() })}
`);
    await handle.sync();
    return await callback();
  } finally {
    await handle.close();
    await unlink(lockPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}
