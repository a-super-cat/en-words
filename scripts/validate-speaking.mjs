#!/usr/bin/env node
// 校验 content/questions 和 content/scenarios。
// 用法：node scripts/validate-speaking.mjs [文件...]
// 不带参数时报告全部文件；带参数时只报告这些文件的问题（id 重复仍会跨文件检查）。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CJK = /[一-鿿]/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const isText = (v) => typeof v === 'string' && v.length > 0 && v === v.trim();
const isEn = (v) => isText(v) && !CJK.test(v);
const isZh = (v) => isText(v) && CJK.test(v);
const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;
const stems = (term) =>
  term
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4)
    .map((w) => w.slice(0, 5));
const uses = (text, term) => {
  const s = stems(term);
  const low = text.toLowerCase();
  return s.length === 0 || s.filter((x) => low.includes(x)).length >= Math.ceil(s.length / 2);
};

const targets = process.argv.slice(2).map((p) => basename(p));
const errors = [];
const warnings = [];
const summary = [];

function checkChunks(chunks, where, err, min, max) {
  if (!Array.isArray(chunks)) return err(`${where} chunks 必须是数组`);
  if (chunks.length < min || chunks.length > max) err(`${where} chunks 应有 ${min}–${max} 个，现在是 ${chunks.length} 个`);
  chunks.forEach((c, i) => {
    if (!isEn(c?.term) || !isZh(c?.zh)) err(`${where} 第 ${i + 1} 个 chunk 需要英文 term 和中文 zh`);
    for (const k of Object.keys(c ?? {})) if (!['term', 'zh'].includes(k)) err(`${where} chunk 有未知字段 ${k}`);
  });
}

function checkQuestion(q, where, err, warn) {
  const allowed = ['id', 'prompt', 'zh', 'outline', 'chunks', 'followUps'];
  for (const k of Object.keys(q)) if (!allowed.includes(k)) err(`${where} 有未知字段 ${k}`);
  if (!isEn(q.prompt)) err(`${where} prompt 必须是英文`);
  if (!isZh(q.zh)) err(`${where} zh 必须是中文`);
  if (!Array.isArray(q.outline) || q.outline.length < 3 || q.outline.length > 5) {
    err(`${where} outline 应有 3–5 条`);
  } else {
    q.outline.forEach((line, i) => {
      if (!isEn(line)) err(`${where} 提纲第 ${i + 1} 条必须是英文`);
      else if (wordCount(line) > 14) warn(`${where} 提纲第 ${i + 1} 条有 ${wordCount(line)} 个词，超过 14`);
    });
  }
  checkChunks(q.chunks, where, err, 4, 6);
  if (q.followUps !== undefined && !(Array.isArray(q.followUps) && q.followUps.length <= 2 && q.followUps.every(isEn))) {
    err(`${where} followUps 最多 2 条，必须是英文`);
  }
}

function checkScenario(s, where, err, warn) {
  const allowed = ['id', 'title', 'setting', 'turns'];
  for (const k of Object.keys(s)) if (!allowed.includes(k)) err(`${where} 有未知字段 ${k}`);
  if (!isZh(s.title)) err(`${where} title 必须是中文`);
  if (!isZh(s.setting)) err(`${where} setting 必须是中文`);
  if (!Array.isArray(s.turns) || s.turns.length < 6) return err(`${where} turns 至少 6 轮`);
  if (s.turns.length < 8 || s.turns.length > 12) warn(`${where} 共 ${s.turns.length} 轮，建议 8–12 轮`);
  if (s.turns[0]?.speaker !== 'them') err(`${where} 第一轮应由对方开口`);
  const mine = s.turns.filter((t) => t?.speaker === 'me').length;
  if (mine < 4 || mine > 6) warn(`${where} 你的发言有 ${mine} 轮，建议 4–6 轮`);

  s.turns.forEach((t, i) => {
    const at = `${where} 第 ${i + 1} 轮`;
    const fields = ['speaker', 'name', 'en', 'zh', 'chunks'];
    for (const k of Object.keys(t ?? {})) if (!fields.includes(k)) err(`${at} 有未知字段 ${k}`);
    if (t?.speaker !== 'them' && t?.speaker !== 'me') return err(`${at} speaker 必须是 them 或 me`);
    if (!isEn(t.en)) err(`${at} en 必须是英文`);
    if (!isZh(t.zh)) err(`${at} zh 必须是中文`);
    if (isEn(t.en) && wordCount(t.en) > 60) warn(`${at} 有 ${wordCount(t.en)} 个词，太长了`);
    if (t.speaker === 'them') {
      if (!isText(t.name)) err(`${at} 对方的发言需要 name`);
      if (t.chunks !== undefined) err(`${at} 对方的发言不需要 chunks`);
    } else {
      if (t.name !== undefined) err(`${at} 你的发言不需要 name`);
      checkChunks(t.chunks, at, err, 1, 3);
      for (const c of Array.isArray(t.chunks) ? t.chunks : []) {
        if (isEn(c?.term) && isEn(t.en) && !uses(t.en, c.term)) warn(`${at} 的参考说法里似乎没有用到“${c.term}”`);
        if (isEn(c?.term) && isText(t.zh) && c.term.length > 3 && t.zh.toLowerCase().includes(c.term.toLowerCase())) {
          err(`${at} 的 zh 泄露了英文答案“${c.term}”`);
        }
      }
    }
  });
}

for (const [kind, listKey, check] of [
  ['questions', 'questions', checkQuestion],
  ['scenarios', 'scenarios', checkScenario],
]) {
  const dir = join(root, 'content', kind);
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort()
    : [];
  const seenId = new Map();
  const seenCategory = new Map();

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
    if (typeof data.category !== 'string' || !SLUG.test(data.category)) err('category 只能用小写字母、数字和连字符');
    else if (seenCategory.has(data.category)) err(`分类 ${data.category} 已经在 ${seenCategory.get(data.category)} 里定义过`);
    else seenCategory.set(data.category, file);
    if (!isZh(data.title)) err('title 必须是中文');
    const list = data[listKey];
    if (!Array.isArray(list) || list.length === 0) {
      err(`${listKey} 必须是非空数组`);
      continue;
    }
    summary.push({ file, inScope, kind, count: list.length });

    list.forEach((item, i) => {
      const where = `第 ${i + 1} 项${isText(item?.id) ? `（${item.id}）` : ''}`;
      if (item === null || typeof item !== 'object') return err(`${where} 不是对象`);
      if (typeof item.id !== 'string' || !SLUG.test(item.id)) err(`${where} id 只能用小写字母、数字和连字符`);
      else if (seenId.has(item.id)) {
        const prev = seenId.get(item.id);
        err(`${where} 的 id 和 ${prev === file ? '本文件' : prev} 里的重复`, targets.includes(prev));
      } else seenId.set(item.id, file);
      check(item, where, err, warn);
    });
  }
}

for (const missing of targets.filter((t) => !summary.some((s) => s.file === t))) {
  errors.push(`${missing}: 文件不存在，或者没能解析`);
}

for (const w of warnings) console.log(`warning  ${w}`);
for (const e of errors) console.log(`error    ${e}`);
const shown = summary.filter((s) => s.inScope);
const total = (kind) => shown.filter((s) => s.kind === kind).reduce((n, s) => n + s.count, 0);
console.log(
  `\n${shown.length} 个文件：${total('questions')} 道题，${total('scenarios')} 个场景；${errors.length} 个 error，${warnings.length} 个 warning`,
);
process.exit(errors.length > 0 ? 1 : 0);
