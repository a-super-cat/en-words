#!/usr/bin/env node
// 从 ECDICT 的 ecdict.csv 生成应用用的词典 content/wordlists/frequency.json。
// 用法：node scripts/build-wordlist.mjs data/raw/ecdict/ecdict.csv
//
// 产出两部分，每个词都带中文释义、音标和变形（复数、过去式等，阅读助手靠它把文中的词还原成原形）：
//   words：最常用的 SIZE 个词的原形，按词频排序，数组下标 + 1 就是词频排名。
//   extra：排名靠后或没有排名、但技术阅读里常见的词。来源是内置内容（词块、面试题、场景）里出现过的词，
//          加上带计算机义项、排名在 EXTRA_MAX_RANK 以内的词。带计算机义项的标记为技术词。
// 数据来源：https://github.com/skywind3000/ECDICT （MIT 授权）
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 30000;
const EXTRA_MAX_RANK = 80000;
const MAX_ZH = 48;
const FORM_KEYS = ['p', 'd', 'i', '3', 's', 'r', 't'];
const TECH = '[计]';

const src = process.argv[2];
if (!src) {
  console.error('用法：node scripts/build-wordlist.mjs <ecdict.csv 的路径>');
  process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'content', 'wordlists', 'frequency.json');

/** 解析一行 CSV：支持双引号包裹和 "" 转义。ECDICT 的字段里没有真正的换行，换行写成字面的 \n。 */
function parseLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

/** 释义压成一行。技术词把计算机义项放在最前面；其余取前两行；去掉“[网络]”这类来源不明的义项。 */
function gloss(translation, techFirst) {
  let lines = translation
    .split('\\n')
    .map((s) => s.trim().replace(/[;；]\s*DOS[^；;]*/g, ''))
    .filter((s) => s && !s.startsWith('[网络]'));
  if (techFirst) lines = [...lines.filter((s) => s.startsWith(TECH)), ...lines.filter((s) => !s.startsWith(TECH))];
  let text = lines.slice(0, 2).join('；').replace(/\s+/g, ' ');
  if (text.length > MAX_ZH) text = text.slice(0, MAX_ZH - 1).replace(/[，,；; ]+$/, '') + '…';
  return text;
}

// ---- 读词典 ----
const lines = readFileSync(src, 'utf8').split(/\r?\n/);
const header = parseLine(lines[0]);
const col = Object.fromEntries(header.map((name, i) => [name, i]));
for (const name of ['word', 'phonetic', 'translation', 'bnc', 'frq', 'exchange']) {
  if (!(name in col)) throw new Error(`CSV 里没有 ${name} 列`);
}

/** 小写单词 → 词条。只收小写的普通词：大写开头的多是专有名词，带空格的是词组。 */
const dict = new Map();
/** 变形 → 原形（gave → give） */
const lemmaOf = new Map();
for (let n = 1; n < lines.length; n++) {
  if (!lines[n]) continue;
  const c = parseLine(lines[n]);
  const word = c[col.word];
  if (!/^[a-z][a-z'-]*$/.test(word) && word !== 'I') continue;
  const translation = c[col.translation];
  if (!translation || /男子名|女子名|姓氏/.test(translation)) continue;
  // P0-3：纯缩写、纯地名的词条不进词典，免得混进测评抽样（抽到一个就偏 10%）。
  // 判定口径：所有义项都是这类才跳过；只要有一条正常义项就保留。
  // 例外：排名 5000 以内的纯缩写（比如 ceo）是真词汇，阅读里天天见，留着。
  const senses = translation.split('\\n').map((s) => s.trim()).filter(Boolean);
  const roughRank = Number(c[col.frq]) || Number(c[col.bnc]) * 2 || Infinity;
  if (senses.length > 0 && roughRank > 5000 && senses.every((s) => s.startsWith('abbr.'))) continue;
  if (
    senses.length > 0 &&
    senses.every((s) => /地名|郡名|（英国|（美国|（西班牙|（德国|（法国|（意大利|（加拿大|（爱尔兰|（新西兰|（荷兰|（苏格兰|（英格兰/.test(s))
  ) {
    continue;
  }
  const exchange = Object.fromEntries(
    c[col.exchange]
      .split('/')
      .filter(Boolean)
      .map((kv) => [kv.slice(0, kv.indexOf(':')), kv.slice(kv.indexOf(':') + 1)]),
  );
  const key = word.toLowerCase();
  // 变形有两种标法：exchange 里的 0:原形，或者只在释义里写着“be的现在时复数”
  const viaGloss = /^([a-z]+)的(过去式|过去分词|现在分词|现在时|复数|第三人称|比较级|最高级)/.exec(translation);
  const lemma = (exchange['0'] ?? viaGloss?.[1])?.toLowerCase();
  if (lemma && lemma !== key) {
    lemmaOf.set(key, lemma);
    continue;
  }
  const frq = Number(c[col.frq]) || 0;
  const bnc = Number(c[col.bnc]) || 0;
  const tech = translation.includes(TECH);
  dict.set(key, {
    word,
    translation,
    tech,
    phonetic: c[col.phonetic],
    // 当代语料的词频更贴近技术阅读。只有 BNC 排名的多是旧词和专名，排名打对折处理。
    rank: frq || bnc * 2,
    forms: [...new Set(FORM_KEYS.map((k) => exchange[k]).filter((f) => f && f !== word && /^[a-z'-]+$/.test(f)))],
  });
}

// 原形自己的 exchange 不一定列全了变形（be 就没列 are），把反方向标出来的也补进去
for (const [form, lemma] of lemmaOf) {
  const e = dict.get(lemma);
  if (e && /^[a-z'-]+$/.test(form) && !e.forms.includes(form)) e.forms.push(form);
}

// ECDICT 里的 am 只有“上午”的缩写义，没有标成 be 的变形，手工补上
if (dict.has('be') && !dict.get('be').forms.includes('am')) dict.get('be').forms.push('am');

// P0-2：人工覆盖表。通用词典给技术词的日常义项会误导（scalable 显示“可攀登的”），
// 覆盖表里的词直接用人工释义，不走 gloss() 的截断逻辑。
const overridesPath = join(root, 'content', 'wordlists', 'overrides.json');
const overrides = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, 'utf8')) : {};

const pack = (e, techFirst) => [
  e.word,
  overrides[e.word.toLowerCase()] ?? gloss(e.translation, techFirst),
  e.phonetic,
  e.forms.join(' '),
];

// ---- 通用高频词 ----
const ranked = [...dict.values()].filter((e) => e.rank > 0).sort((a, b) => a.rank - b.rank || a.word.localeCompare(b.word));
const top = ranked.slice(0, SIZE);
const inTop = new Set(top.map((e) => e.word.toLowerCase()));

// ---- 补充词 ----
function* strings(value) {
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) for (const v of value) yield* strings(v);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) yield* strings(v);
}

const used = new Set();
for (const sub of ['entries', 'questions', 'scenarios']) {
  const dir = join(root, 'content', sub);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    for (const text of strings(JSON.parse(readFileSync(join(dir, file), 'utf8')))) {
      for (const token of text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? []) used.add(token.replace(/'s$/, ''));
    }
  }
}

const extra = new Map();
for (const token of used) {
  const key = dict.has(token) ? token : lemmaOf.get(token);
  const e = key && dict.get(key);
  if (e && !inTop.has(key)) extra.set(key, e);
}
const fromContent = extra.size;
for (const e of ranked.slice(SIZE)) {
  if (e.rank > EXTRA_MAX_RANK) break;
  if (e.tech) extra.set(e.word.toLowerCase(), e);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({
    source: 'ECDICT (https://github.com/skywind3000/ECDICT), MIT License',
    note: '由 scripts/build-wordlist.mjs 生成，不要手工修改。每项是 [单词, 中文释义, 音标, 变形]。words 按词频排序；extra 是补充的低频词，第 5 项为 1 表示技术词。',
    words: top.map((e) => pack(e, false)),
    extra: [...extra.values()]
      .sort((a, b) => a.word.localeCompare(b.word))
      .map((e) => [...pack(e, e.tech), e.tech ? 1 : 0]),
  }) + '\n',
  'utf8',
);

console.log(`通用高频词 ${top.length} 个；补充词 ${extra.size} 个（内置内容里出现的 ${fromContent} 个，其中技术词 ${[...extra.values()].filter((e) => e.tech).length} 个）`);
for (const at of [0, 999, 2999, 5999, 8999, 11999, 14994]) {
  console.log(`#${at + 1}`, top.slice(at, at + 6).map((e) => e.word).join(', '));
}
