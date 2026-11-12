#!/usr/bin/env node
// 校验 content/entries 下的内容文件。
// 用法：node scripts/validate-content.mjs [文件...]
// 不带参数时报告全部文件；带参数时只报告这些文件的问题（跨文件重复仍会检查）。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'content', 'entries');

const LAYERS = ['A', 'B', 'C', 'D'];
const KINDS = ['word', 'chunk', 'sentence'];
const REGISTERS = ['formal', 'neutral', 'casual'];
const ENTRY_KEYS = ['id', 'term', 'kind', 'zh', 'ipa', 'examples', 'situation', 'collocations', 'register', 'note'];
const CJK = /[一-鿿]/;
const MAX_PER_FILE = 50;
const MAX_EXAMPLE_WORDS = 22;

// 必须和 src/content/slug.ts 保持一致
const slug = (term) =>
  term
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const isText = (v) => typeof v === 'string' && v.length > 0 && v === v.trim();
const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;
const stems = (term) =>
  term
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4)
    .map((w) => w.slice(0, 5));

const targets = process.argv.slice(2).map((p) => basename(p));
const files = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
  : [];

const errors = [];
const warnings = [];
const seenTerm = new Map();
const seenId = new Map();
const categoryTitle = new Map();
const summary = [];

for (const missing of targets.filter((t) => !files.includes(t))) {
  errors.push(`${missing}: 文件不存在于 content/entries`);
}

for (const file of files) {
  const inScope = targets.length === 0 || targets.includes(file);
  const err = (msg, force = false) => (inScope || force) && errors.push(`${file}: ${msg}`);
  const warn = (msg) => inScope && warnings.push(`${file}: ${msg}`);

  let data;
  try {
    const raw = readFileSync(join(dir, file), 'utf8');
    if (raw.charCodeAt(0) === 0xfeff) err('文件带 BOM，请去掉');
    data = JSON.parse(raw.replace(/^﻿/, ''));
  } catch (e) {
    err(`不是合法的 JSON：${e.message}`);
    continue;
  }

  if (!LAYERS.includes(data.layer)) err(`layer 必须是 ${LAYERS.join('/')}`);
  if (typeof data.category !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.category)) {
    err('category 只能用小写字母、数字和连字符');
  }
  if (!isText(data.title)) err('缺少 title');
  if (!Array.isArray(data.entries) || data.entries.length === 0) {
    err('entries 必须是非空数组');
    continue;
  }
  if (data.entries.length > MAX_PER_FILE) warn(`共 ${data.entries.length} 条，超过每文件 ${MAX_PER_FILE} 条的建议上限`);

  const catKey = `${data.layer}.${data.category}`;
  if (categoryTitle.has(catKey) && categoryTitle.get(catKey) !== data.title) {
    err(`分类 ${catKey} 的 title 和其他文件不一致（“${categoryTitle.get(catKey)}”）`);
  }
  categoryTitle.set(catKey, data.title);

  const needsContext = data.layer === 'B' || data.layer === 'C';
  summary.push({ file, inScope, count: data.entries.length });

  data.entries.forEach((e, i) => {
    const where = `第 ${i + 1} 条${isText(e?.term) ? `（${e.term}）` : ''}`;
    if (e === null || typeof e !== 'object' || Array.isArray(e)) return err(`${where} 不是对象`);

    for (const k of Object.keys(e)) if (!ENTRY_KEYS.includes(k)) err(`${where} 有未知字段 ${k}`);
    if (!isText(e.term)) return err(`${where} 缺少 term，或首尾有空格`);
    if (!KINDS.includes(e.kind)) err(`${where} kind 必须是 ${KINDS.join('/')}`);
    if (!isText(e.zh) || !CJK.test(e.zh)) err(`${where} zh 必须是中文提示`);
    else if (e.zh.toLowerCase().includes(e.term.toLowerCase()) && e.term.length > 3) {
      err(`${where} zh 里直接出现了英文答案`);
    }
    if (e.register !== undefined && !REGISTERS.includes(e.register)) err(`${where} register 不合法`);
    for (const k of ['note', 'ipa']) if (e[k] !== undefined && !isText(e[k])) err(`${where} ${k} 必须是非空字符串`);
    if (e.collocations !== undefined && !(Array.isArray(e.collocations) && e.collocations.every(isText))) {
      err(`${where} collocations 必须是字符串数组`);
    }

    const english = [];
    if (e.examples === undefined || (Array.isArray(e.examples) && e.examples.length === 0)) {
      if (needsContext || data.layer === 'A') err(`${where} 缺少 examples`);
    } else if (!Array.isArray(e.examples)) {
      err(`${where} examples 必须是数组`);
    } else {
      if (e.examples.length > 2) warn(`${where} 例句超过 2 个`);
      e.examples.forEach((x, j) => {
        if (!isText(x?.en) || !isText(x?.zh)) return err(`${where} 例句 ${j + 1} 缺少 en 或 zh`);
        if (CJK.test(x.en)) err(`${where} 例句 ${j + 1} 的 en 里有中文`);
        if (!CJK.test(x.zh)) err(`${where} 例句 ${j + 1} 的 zh 不是中文`);
        if (j === 0 && wordCount(x.en) > MAX_EXAMPLE_WORDS) {
          warn(`${where} 第一个例句 ${wordCount(x.en)} 个词，超过 ${MAX_EXAMPLE_WORDS}`);
        }
        english.push(x.en);
      });
    }

    if (e.situation === undefined) {
      if (needsContext) err(`${where} 缺少 situation`);
    } else if (!isText(e.situation?.zh) || !isText(e.situation?.en)) {
      err(`${where} situation 缺少 zh 或 en`);
    } else {
      if (!CJK.test(e.situation.zh)) err(`${where} situation.zh 不是中文`);
      if (CJK.test(e.situation.en)) err(`${where} situation.en 里有中文`);
      if (e.term.length > 3 && e.situation.zh.toLowerCase().includes(e.term.toLowerCase())) {
        err(`${where} situation.zh 泄露了英文答案`);
      }
      english.push(e.situation.en);
    }

    const s = stems(e.term);
    if (s.length > 0 && english.length > 0) {
      const lacks = english.filter((t) => {
        const low = t.toLowerCase();
        return s.filter((x) => low.includes(x)).length < Math.ceil(s.length / 2);
      });
      if (lacks.length > 0) warn(`${where} 有 ${lacks.length} 处例句或参考回答里似乎没有用到 term`);
    }

    const id = e.id ?? `${data.layer.toLowerCase()}.${data.category}.${slug(e.term)}`;
    if (slug(e.term) === '') err(`${where} term 无法生成 id`);
    const termKey = e.term.toLowerCase();
    for (const [map, key, label] of [
      [seenId, id, 'id'],
      [seenTerm, termKey, 'term'],
    ]) {
      const prev = map.get(key);
      if (prev !== undefined) {
        const prevInScope = targets.length === 0 || targets.includes(prev);
        if (label === 'term' || prev === file || seenTerm.get(termKey) === undefined) {
          err(`${where} 的 ${label} 和 ${prev === file ? '本文件' : prev} 里的条目重复`, prevInScope);
        }
      } else {
        map.set(key, file);
      }
    }
  });
}

for (const w of warnings) console.log(`warning  ${w}`);
for (const e of errors) console.log(`error    ${e}`);
const shown = summary.filter((s) => s.inScope);
console.log(
  `\n${shown.length} 个文件，${shown.reduce((n, s) => n + s.count, 0)} 条；${errors.length} 个 error，${warnings.length} 个 warning`,
);
process.exit(errors.length > 0 ? 1 : 0);
