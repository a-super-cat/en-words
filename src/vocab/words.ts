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
}

export function buildWordQueue(input: WordQueueInput): WordQueue {
  const all = [...input.cards];
  const due = all
    .filter((c) => !c.suspended && c.due <= endOfDay(input.now))
    .sort((a, b) => a.due - b.due);
  const have = new Set(all.map((c) => c.word));
  const fresh: WordQueue['fresh'] = [];
  const picked = new Set<string>();
  for (const term of input.notebookWords) {
    const key = term.toLowerCase();
    if (have.has(key) || picked.has(key)) continue;
    picked.add(key);
    fresh.push({ word: key, fromNotebook: true });
  }
  for (const d of input.ranked) {
    if (d.rank === null || d.rank <= input.knownRank) continue;
    const key = d.word.toLowerCase();
    if (have.has(key) || picked.has(key)) continue;
    if (input.marks.get(key) === 'known') continue;
    picked.add(key);
    fresh.push({ word: key, fromNotebook: false });
  }
  return { due, fresh: fresh.slice(0, Math.max(0, input.newLimit)) };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 从词条例句里反查这个词出现过的句子，给单词卡当例句；没有就返回 undefined */
export function findExample(
  word: string,
  entries: Entry[],
): { en: string; zh: string } | undefined {
  const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i');
  for (const e of entries) {
    for (const ex of e.examples) {
      if (re.test(ex.en)) return ex;
    }
  }
  return undefined;
}
