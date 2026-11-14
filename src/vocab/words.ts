// 单词线的纯逻辑：队列组装、FSRS 排期适配、词源链接、例句反查。
// 排期不另写一套：把 WordCardState 适配成 CardState 复用 srs/schedule 的引擎，
// 只是存储和计数与词条卡分开，两条线互不干扰。
import { endOfDay, startOfDay } from '../srs/queue';
import { newCard, previewDays, rateCard } from '../srs/schedule';
import { MATURE_DAYS } from '../srs/stats';
import type { CardState, Entry, Rating, WordCardState } from '../types';
import type { Mark } from './analyze';
import type { DictWord } from './dictionary';

/** Etymonline 词源页链接：站方挡嵌入和抓取，只能跳转到它的页面看全文 */
export const etymUrl = (word: string): string =>
  `https://www.etymonline.com/word/${encodeURIComponent(word.toLowerCase())}`;

function toCard(w: WordCardState): CardState {
  return {
    key: `word|${w.word}`,
    entryId: w.word,
    direction: 'recognize',
    due: w.due,
    stability: w.stability,
    difficulty: w.difficulty,
    scheduledDays: w.scheduledDays,
    learningSteps: w.learningSteps,
    reps: w.reps,
    lapses: w.lapses,
    state: w.state,
    lastReview: w.lastReview,
    suspended: w.suspended,
    leech: false,
    createdAt: w.createdAt,
  };
}

function fromCard(c: CardState, word: string, createdAt: number): WordCardState {
  return {
    word,
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    scheduledDays: c.scheduledDays,
    learningSteps: c.learningSteps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.lastReview,
    suspended: c.suspended,
    createdAt,
  };
}

export function newWordCard(word: string, now: number): WordCardState {
  const key = word.toLowerCase();
  return fromCard(newCard(key, 'recognize', now), key, now);
}

export function rateWordCard(card: WordCardState, rating: Rating, now: number): WordCardState {
  return fromCard(rateCard(toCard(card), rating, now), card.word, card.createdAt);
}

/** 四个评分各自会把下次复习排到几天后，评分按钮上给用户预览 */
export function previewWordDays(card: WordCardState, now: number): Record<Rating, number> {
  return previewDays(toCard(card), now);
}

export type WordStatus = 'new' | 'learning' | 'mature' | 'suspended';

export function wordStatus(card: WordCardState | undefined): WordStatus {
  if (!card) return 'new';
  if (card.suspended) return 'suspended';
  return card.stability >= MATURE_DAYS ? 'mature' : 'learning';
}

/** 今天已经引入了几个新词（按建卡时间算自然日） */
export function introducedToday(cards: Iterable<WordCardState>, now: number): number {
  const start = startOfDay(now);
  let n = 0;
  for (const c of cards) if (c.createdAt >= start) n++;
  return n;
}

export interface WordQueue {
  /** 到期复习，按到期时间从旧到新 */
  due: WordCardState[];
  /** 今天要学的新词：生词本优先，其次按词频从高到低 */
  fresh: { word: string; fromNotebook: boolean }[];
}

export interface WordQueueInput {
  cards: Iterable<WordCardState>;
  /** 生词本里的词（词条 term），顺序即收集顺序 */
  notebookWords: string[];
  /** 按词频排序的词典 */
  ranked: DictWord[];
  marks: ReadonlyMap<string, Mark>;
  /** 词频排名在这个数以内的默认认识，新词从它之后开始挑 */
  knownRank: number;
  /** 今天还能引入的新词个数（调用方先扣掉今天已引入的） */
  newLimit: number;
  now: number;
  /** 词条线正在学的单词（小写词形）：和当前学习内容互相印证，优先于纯词频 */
  studying?: ReadonlySet<string>;
  /** 词条线已经掌握的单词（小写词形）：不再当新词推 */
  mastered?: ReadonlySet<string>;
}

export function buildWordQueue(input: WordQueueInput): WordQueue {
  const all = [...input.cards];
  const due = all
    .filter((c) => !c.suspended && c.due <= endOfDay(input.now))
    .sort((a, b) => a.due - b.due);
  const have = new Set(all.map((c) => c.word));
  const mastered = input.mastered ?? new Set<string>();
  const studying = input.studying ?? new Set<string>();
  const fresh: WordQueue['fresh'] = [];
  const picked = new Set<string>();
  const take = (key: string, fromNotebook: boolean) => {
    if (have.has(key) || picked.has(key) || mastered.has(key)) return;
    picked.add(key);
    fresh.push({ word: key, fromNotebook });
  };
  // 第一级：生词本（用户亲手收集的，优先级最高，不受词频门槛限制）
  for (const term of input.notebookWords) take(term.toLowerCase(), true);
  // 第二级：测评、筛查里明确标过“不认识”的词（用户信号比统计门槛可靠，同样不受 knownRank 限制）
  for (const d of input.ranked) {
    const key = d.word.toLowerCase();
    if (input.marks.get(key) === 'unknown') take(key, false);
  }
  // 第三级：词条线正在学的单词，在这边同步认读、互相印证
  for (const d of input.ranked) {
    const key = d.word.toLowerCase();
    if (studying.has(key)) take(key, false);
  }
  // 第四级：其余按词频从高到低推进，跳过默认认识范围和标过“认识”的
  for (const d of input.ranked) {
    if (d.rank === null || d.rank <= input.knownRank) continue;
    const key = d.word.toLowerCase();
    if (input.marks.get(key) === 'known') continue;
    take(key, false);
  }
  return { due, fresh: fresh.slice(0, Math.max(0, input.newLimit)) };
}

export interface WordSessionItem {
  word: string;
  kind: 'due' | 'notebook' | 'new';
  /** intro = 先学（完整呈现、不打分）；test = 考（回忆后评分） */
  mode: 'intro' | 'test';
}

/**
 * 把一轮学习编排成“先学后测”：新词先以 intro 形式混编进复习流
 * （每 2 张复习卡插 1 个，多出来的接在后面），全部内容之后再把新词以 test 形式考一遍。
 * 新词第一次见面就考试是假考试——先呈现、隔一段再提取，评分才有意义。
 */
export function buildWordSession(
  due: WordCardState[],
  fresh: WordQueue['fresh'],
): WordSessionItem[] {
  const intros: WordSessionItem[] = fresh.map((f) => ({
    word: f.word,
    kind: f.fromNotebook ? 'notebook' : 'new',
    mode: 'intro',
  }));
  const tests: WordSessionItem[] = fresh.map((f) => ({
    word: f.word,
    kind: f.fromNotebook ? 'notebook' : 'new',
    mode: 'test',
  }));
  const out: WordSessionItem[] = [];
  let ii = 0;
  due.forEach((c, i) => {
    out.push({ word: c.word, kind: 'due', mode: 'test' });
    if ((i + 1) % 2 === 0 && ii < intros.length) out.push(intros[ii++]);
  });
  while (ii < intros.length) out.push(intros[ii++]);
  return [...out, ...tests];
}

/** 例句挖空：把例句里目标词的原形换成空。其余词形（变形）挖不了，返回 null */
export function makeCloze(word: string, exampleEn: string): string | null {
  const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i');
  if (!re.test(exampleEn)) return null;
  return exampleEn.replace(re, '______');
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 从词条例句里反查这个词出现过的句子，给单词卡和单词详情当例句 */
export function findExamples(
  word: string,
  entries: Entry[],
  limit = 3,
): { en: string; zh: string }[] {
  const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i');
  const out: { en: string; zh: string }[] = [];
  for (const e of entries) {
    for (const ex of e.examples) {
      if (re.test(ex.en)) {
        out.push(ex);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

/** 从词条例句里反查这个词出现过的句子，给单词卡当例句；没有就返回 undefined */
export function findExample(
  word: string,
  entries: Entry[],
): { en: string; zh: string } | undefined {
  return findExamples(word, entries, 1)[0];
}

export interface BandProgress {
  /** 第几段，从 1 开始 */
  band: number;
  total: number;
  /** 标过“认识”、还没建卡的词 */
  known: number;
  mastered: number;
  learning: number;
  suspended: number;
  /** 还没碰过的词（含标过“不认识”的） */
  remaining: number;
}

/**
 * 按词频段汇总单词线的进度（单词页的进度面板和分段词表页共用）。
 * 口径和 buildWordQueue 一致：有卡按卡的状态算，没卡看 marks。
 */
export function bandProgress(
  ranked: DictWord[],
  cards: Iterable<WordCardState>,
  marks: ReadonlyMap<string, Mark>,
  bandSize = 1000,
): BandProgress[] {
  const byWord = new Map<string, WordCardState>();
  for (const c of cards) byWord.set(c.word, c);
  const bands = new Map<number, BandProgress>();
  for (const d of ranked) {
    if (d.rank === null) continue;
    const band = Math.ceil(d.rank / bandSize);
    let row = bands.get(band);
    if (!row) {
      row = { band, total: 0, known: 0, mastered: 0, learning: 0, suspended: 0, remaining: 0 };
      bands.set(band, row);
    }
    row.total++;
    const key = d.word.toLowerCase();
    const card = byWord.get(key);
    if (card) {
      const s = wordStatus(card);
      if (s === 'mature') row.mastered++;
      else if (s === 'suspended') row.suspended++;
      else row.learning++;
    } else if (marks.get(key) === 'known') {
      row.known++;
    } else {
      row.remaining++;
    }
  }
  return [...bands.values()].sort((a, b) => a.band - b.band);
}
