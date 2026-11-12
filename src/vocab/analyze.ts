import type { Dictionary, DictWord } from './dictionary';

export type WordStatus = 'known' | 'learning' | 'unknown' | 'offlist';
export type Mark = 'known' | 'unknown';

/** 判断一个词认不认识所需要的信息 */
export interface KnownModel {
  /** 默认认识词频排名在这个数以内的词（来自测评，也可以手动改） */
  knownRank: number;
  /** 手动标记，优先于按排名的默认判断 */
  marks: ReadonlyMap<string, Mark>;
  /** 已经加入复习、但还没掌握的单词（小写） */
  studying: ReadonlySet<string>;
  /** 复习里已经掌握的单词（小写） */
  mastered: ReadonlySet<string>;
}

export interface Segment {
  text: string;
  /** 不是单词的片段（空格、标点、数字）没有下面这些字段 */
  key?: string;
  word?: DictWord;
  status?: WordStatus;
  start?: number;
}

export interface UnknownWord {
  key: string;
  word: DictWord;
  status: 'unknown' | 'learning';
  count: number;
  /** 这个词在文中第一次出现的句子 */
  sentence: string;
}

export interface Analysis {
  segments: Segment[];
  /** 单词总数 */
  total: number;
  /** 词典里查得到、计入覆盖率的单词数 */
  counted: number;
  known: number;
  /** 认识的词占计入词数的比例，0–1。没有可计入的词时是 1。 */
  coverage: number;
  /** 不认识和学习中的词，按出现次数从多到少排 */
  unknown: UnknownWord[];
  /** 词典里没有的词：专有名词、很新的术语、拼写错误等 */
  offlist: string[];
}

const MAX_SENTENCE = 240;

export function statusOf(key: string, word: DictWord | undefined, model: KnownModel): WordStatus {
  if (model.mastered.has(key)) return 'known';
  if (model.studying.has(key)) return 'learning';
  const mark = model.marks.get(key);
  if (mark) return mark;
  if (!word) return 'offlist';
  if (word.tech) return 'known';
  return word.rank !== null && word.rank <= model.knownRank ? 'known' : 'unknown';
}

/** 取出 index 所在的句子：向两边找到句号、问号、感叹号或换行为止 */
export function sentenceAt(text: string, index: number): string {
  const before = text.slice(0, index);
  const start = Math.max(before.lastIndexOf('. '), before.lastIndexOf('? '), before.lastIndexOf('! '), before.lastIndexOf('\n')) + 1;
  const rest = text.slice(index);
  const stop = rest.search(/[.?!](\s|$)|\n/);
  const end = stop < 0 ? text.length : index + stop + 1;
  const sentence = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return sentence.length > MAX_SENTENCE ? sentence.slice(0, MAX_SENTENCE - 1) + '…' : sentence;
}

export function analyze(text: string, dict: Dictionary, model: KnownModel): Analysis {
  const segments: Segment[] = [];
  const unknown = new Map<string, UnknownWord>();
  const offlist = new Set<string>();
  let total = 0;
  let counted = 0;
  let known = 0;
  let last = 0;

  // 连字符两边当成两个词（read-heavy → read、heavy），撇号留在词里（don't）
  for (const m of text.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)) {
    const start = m.index;
    if (start > last) segments.push({ text: text.slice(last, start) });
    last = start + m[0].length;

    const word = dict.resolve(m[0]);
    const key = (word?.word ?? m[0]).toLowerCase();
    // 单个字母（a、I、x）不算生词
    const status = m[0].length === 1 ? 'known' : statusOf(key, word, model);
    segments.push({ text: m[0], key, word, status, start });
    total++;

    if (status === 'offlist') {
      offlist.add(m[0]);
      continue;
    }
    counted++;
    if (status === 'known') {
      known++;
    } else if (word) {
      const seen = unknown.get(key);
      if (seen) seen.count++;
      else unknown.set(key, { key, word, status, count: 1, sentence: sentenceAt(text, start) });
    }
  }
  if (last < text.length) segments.push({ text: text.slice(last) });

  return {
    segments,
    total,
    counted,
    known,
    coverage: counted === 0 ? 1 : known / counted,
    unknown: [...unknown.values()].sort(
      (a, b) => b.count - a.count || (a.word.rank ?? Infinity) - (b.word.rank ?? Infinity) || a.key.localeCompare(b.key),
    ),
    offlist: [...offlist].sort((a, b) => a.localeCompare(b)),
  };
}
