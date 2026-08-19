import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { prettyJson, sha256 } from './json.mjs';
import { resolveWithin } from './fs-transaction.mjs';

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

function safeName(value, fallback = '组件') {
  const name = String(value ?? '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim();
  return name || fallback;
}

function htmlFromReplacement(value) {
  const text = String(value ?? '').trim();
  if (!/<(?:!doctype\s+html|html\b|body\b|style\b|script\b)/i.test(text)) return null;
  return text.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/, '').trim() + '\n';
}

function isHtmlRegex(regex) {
  return Boolean(htmlFromReplacement(regex?.replaceString));
}

function standaloneWorldbookEntry(entry, uid) {
  const extensions = entry?.extensions ?? {};
  return {
    uid,
    key: Array.isArray(entry?.keys) ? clone(entry.keys) : [],
    keysecondary: Array.isArray(entry?.secondary_keys) ? clone(entry.secondary_keys) : [],
    comment: entry?.comment ?? '',
    content: String(entry?.content ?? ''),
    constant: entry?.constant === true,
    selective: entry?.selective === true,
    selectiveLogic: entry?.selectiveLogic ?? extensions.selectiveLogic ?? 0,
    addMemo: true,
    order: Number.isInteger(entry?.insertion_order) ? entry.insertion_order : 100,
    position: entry?.position === 'after_char' ? 1 : 0,
    disable: entry?.enabled === false,
    useProbability: entry?.useProbability ?? extensions.useProbability ?? true,
    probability: Number.isFinite(entry?.probability) ? entry.probability : 100,
    depth: Number.isInteger(entry?.depth) ? entry.depth : 4,
    scanDepth: Number.isInteger(extensions.scan_depth) ? extensions.scan_depth : 4,
    caseSensitive: entry?.caseSensitive ?? extensions.case_sensitive ?? false,
    matchWholeWords: entry?.matchWholeWords ?? extensions.match_whole_words ?? false,
    excludeRecursion: entry?.excludeRecursion ?? extensions.exclude_recursion ?? false,
    preventRecursion: entry?.preventRecursion ?? extensions.prevent_recursion ?? false,
    delayUntilRecursion: entry?.delayUntilRecursion ?? extensions.delay_until_recursion ?? false,
    group: entry?.group ?? '',
    groupOverride: entry?.groupOverride ?? false,
    useGroupScoring: entry?.useGroupScoring ?? false,
    automationId: entry?.automationId ?? '',
    sticky: entry?.sticky ?? null,
    cooldown: entry?.cooldown ?? null,
    delay: entry?.delay ?? 0,
  };
}

function worldbookFromCharacterBook(book) {
  const entries = {};
  const sourceEntries = Array.isArray(book?.entries)
    ? book.entries
    : Object.values(book?.entries ?? {});
  sourceEntries.forEach((entry, index) => {
    entries[String(index)] = standaloneWorldbookEntry(entry, index);
  });
  return {
    entries,
    originalData: {
      name: book?.name ?? '',
      entries,
    },
  };
}

function bareCharacterCard(payload) {
  const card = clone(payload);
  const data = card.data ?? {};
  delete data.character_book;
  delete data.extensions?.world;
  delete data.extensions?.regex_scripts;
  delete data.extensions?.tavern_helper;
  delete data.extensions?.rp_card_studio;
  delete data.extensions?.runtime_manifest_ref;
  card.data = data;
  for (const field of ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example']) {
    if (Object.hasOwn(data, field)) card[field] = data[field];
  }
  card.creatorcomment = data.creator_notes ?? card.creatorcomment ?? '';
  return card;
}

function helperScriptFiles(nodes, outputRoot, parent = []) {
  const files = [];
  for (const node of nodes ?? []) {
    const nodeName = safeName(node?.name, node?.id ?? '脚本');
    if (node?.type === 'folder') {
      files.push(...helperScriptFiles(node.scripts, outputRoot, [...parent, nodeName]));
      continue;
    }
    if (node?.type !== 'script') continue;
    files.push({
      relativePath: [outputRoot, '06_酒馆助手', ...parent, `${nodeName}.json`].join('/'),
      content: prettyJson(clone(node)),
      id: node.id,
      name: node.name,
      role: node.role,
      phase: node.phase,
      depends_on: clone(node.depends_on ?? []),
      provides: clone(node.provides ?? []),
      source_file: node.source_file,
    });
  }
  return files;
}

async function sourceFiles(projectRoot, relativePaths, section = '') {
  const files = [];
  for (const relativePath of relativePaths ?? []) {
    const absolutePath = resolveWithin(projectRoot, relativePath);
    const content = await readFile(absolutePath);
    files.push({
      relativePath: `07_MVU与EJS/${section ? `${safeName(section)}/` : ''}${safeName(path.basename(relativePath))}`,
      content,
      source: relativePath,
    });
  }
  return files;
}

export async function buildDeliveryPackage({ project, projectRoot, source, outputRoot }) {
  const payload = source.payload;
  const data = payload.data ?? {};
  const packageFiles = [];
  const isWorldbook = project.project.target === 'worldbook';
  const cardFile = isWorldbook ? null : `${outputRoot}/02_角色卡/${safeName(data.name ?? project.project.display_name, '角色卡')}.json`;
  if (cardFile) packageFiles.push({ relativePath: cardFile, content: prettyJson(bareCharacterCard(payload)) });

  const worldbook = isWorldbook ? clone(payload) : worldbookFromCharacterBook(data.character_book);
  const worldbookName = worldbook.originalData?.name ?? worldbook.name ?? data.name ?? project.project.display_name;
  const worldbookLabel = safeName(worldbookName, '世界书');
  const worldbookFile = `${outputRoot}/03_世界书/${worldbookLabel.endsWith('世界书') ? worldbookLabel : `${worldbookLabel} 世界书`}.json`;
  packageFiles.push({ relativePath: worldbookFile, content: prettyJson(worldbook) });

  const regexFiles = [];
  const frontendFiles = [];
  for (const regex of data.extensions?.regex_scripts ?? []) {
    const html = htmlFromReplacement(regex.replaceString);
    const baseName = safeName(regex.scriptName ?? regex.id, '正则');
    const regexExport = clone(regex);
    if (html) {
      regexExport.replaceString = '';
      const htmlPath = `${outputRoot}/05_前端/${baseName}.html`;
      packageFiles.push({ relativePath: htmlPath, content: html });
      frontendFiles.push({ id: regex.id, regex: regex.scriptName, file: htmlPath });
    }
    const regexPath = `${outputRoot}/04_正则/${baseName}.json`;
    packageFiles.push({ relativePath: regexPath, content: prettyJson(regexExport) });
    regexFiles.push({ id: regex.id, name: regex.scriptName, file: regexPath, html: html ? frontendFiles.at(-1).file : null });
  }

  const helperFiles = helperScriptFiles(data.extensions?.tavern_helper?.scripts, outputRoot);
  packageFiles.push(...helperFiles);
  const mvuLoaders = helperFiles
    .filter((file) => file.role === 'mvu_loader' || /MagicalAstrogy\/MagVarUpdate(?:@[^/]+)?\/artifact\/bundle\.js/.test(String(file.content)))
    .map((file) => ({ id: file.id, name: file.name, file: file.relativePath, role: 'mvu_loader' }));
  const runtimeBaseline = {
    mvu_loader: mvuLoaders,
    mvu_loader_count: mvuLoaders.length,
    mvu_loader_policy: 'MagVarUpdate 只保留一个启用 Loader；重复实例不会形成更强的运行链',
    mvu_schema: helperFiles
      .filter((file) => file.role === 'mvu_schema' || /registerMvuSchema/.test(String(file.content)))
      .map((file) => ({ id: file.id, name: file.name, file: file.relativePath, role: 'mvu_schema', source_file: file.source_file ?? null })),
    mvu_schema_policy: 'native_schema 可省略 mvu_schema；mvu_zod/hybrid 按项目声明需要注册脚本',
  };

  packageFiles.push(...await sourceFiles(projectRoot, (project.source_manifest?.mvu ?? []).filter(Boolean), 'MVU'));
  packageFiles.push(...await sourceFiles(projectRoot, (project.source_manifest?.ejs ?? []).filter(Boolean), 'EJS'));

  const manifest = {
    schema_version: '1.0.0',
    delivery_mode: 'rp_project_package',
    project_id: project.project.id,
    project_name: project.project.display_name,
    import_order: [
      '角色卡',
      '世界书并绑定到角色',
      '正则配置；将配套 05_前端/*.html 的完整内容粘贴到正则“替换内容”',
      '酒馆助手脚本（先唯一 mvu_loader；按路线决定是否 mvu_schema，再项目专属脚本）',
      'MVU/EJS 宿主依赖与设置',
    ],
    components: {
      character_card: cardFile,
      worldbook: worldbookFile,
      regex: regexFiles,
      frontend: frontendFiles,
      tavern_helper: helperFiles.map((file) => ({
        id: file.id,
        name: file.name,
        file: file.relativePath,
        role: file.role ?? null,
        phase: file.phase ?? null,
        depends_on: clone(file.depends_on ?? []),
        provides: clone(file.provides ?? []),
        source_file: file.source_file ?? null,
      })),
      mvu_ejs: packageFiles.filter((file) => file.relativePath.startsWith(`${outputRoot}/07_MVU与EJS/`)).map((file) => file.relativePath),
    },
    runtime_baseline: runtimeBaseline,
    notes: [
      '前端与正则分开交付；每个前端是完整、自包含 HTML。',
      '本项目不提供单文件角色卡作为最终交付方式。',
      '是否成功挂载世界书、正则、酒馆助手和 MVU，仍需按说明在目标 SillyTavern 中逐项确认。',
    ],
  };
  packageFiles.push({ relativePath: `${outputRoot}/01_项目清单.json`, content: prettyJson(manifest) });

  const instructions = `# ${project.project.display_name} 导入说明\n\n本项目固定以多文件 RP 项目包交付。\n\n## 导入顺序\n\n1. 导入角色卡：打开 \`02_角色卡\`。\n2. 导入世界书：打开 \`03_世界书\`，然后绑定到角色。\n3. 导入 \`04_正则\` 中的配置；对有配套 HTML 的正则，将 \`05_前端\` 中同名 HTML 的全部内容复制到正则的“替换内容”。\n4. 导入 \`06_酒馆助手\` 中的脚本。若项目启用 MVU，先导入/启用唯一的 \`role: mvu_loader\`；只有 \`mvu_zod\`/\`hybrid\` 或项目明确选择的路线才导入 \`role: mvu_schema\`，最后再启用项目专属同步、事件或生命周期脚本。\n5. 按 \`07_MVU与EJS\` 和最终报告检查宿主依赖、全局世界书设置副作用、Loader 二级远程依赖和当前版本能力。\n\nHTML 不依赖同目录的 CSS 或 JS 文件；每个页面已经是完整自包含文档。\n`;
  packageFiles.push({ relativePath: `${outputRoot}/00_导入说明.md`, content: instructions });

  const report = `# ${project.project.display_name} 项目包构建报告\n\n- 交付模式：多文件 RP 项目包\n- 项目清单：01_项目清单.json\n- 角色卡：${cardFile}\n- 世界书：${worldbookFile}\n- 正则数量：${regexFiles.length}\n- 完整前端数量：${frontendFiles.length}\n- 酒馆助手脚本数量：${helperFiles.length}\n- 真实 SillyTavern 验收：not_run（除非另有记录）\n`;
  packageFiles.push({ relativePath: `${outputRoot}/08_验证报告.md`, content: report });

  const manifestBytes = Buffer.from(prettyJson(manifest), 'utf8');
  return {
    files: packageFiles,
    manifest,
    manifestBytes,
    artifactDigest: sha256(manifestBytes),
    outputRoot,
  };
}
