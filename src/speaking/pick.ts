import type { CardState, Chunk, Entry } from '../types';

/** 第 1 遍和第 2 遍的作答时限（秒）。第 2 遍更短，逼自己说得更紧凑。 */
export const ROUND_SECONDS = { 1: 120, 2: 90 } as const;

/** 录音只保留最近这么多次口答的，避免浏览器存储越积越多 */
export const KEEP_AUDIO = 20;

/**
 * 下一个该练的题目或场景。先选最久没练的分类（没练过的分类最优先），
 * 再在分类里选没练过的；都练过就选最久没练的。并列时按内容原有的顺序。
 */
export function pickNext<T extends { id: string; category: string }>(
  items: T[],
  lastAt: ReadonlyMap<string, number>,
  exclude?: string,
): T | undefined {
  const pool = items.filter((i) => i.id !== exclude);
  if (pool.length === 0) return undefined;

  const categoryLast = new Map<string, number>();
  for (const i of pool) {
    categoryLast.set(i.category, Math.max(categoryLast.get(i.category) ?? 0, lastAt.get(i.id) ?? 0));
  }
  // Array.sort 是稳定排序，并列的保持原有顺序
  const category = [...categoryLast].sort((a, b) => a[1] - b[1])[0][0];
  return pool
    .filter((i) => i.category === category)
    .sort((a, b) => (lastAt.get(a.id) ?? 0) - (lastAt.get(b.id) ?? 0))[0];
}

/** 超出保留数量的旧录音：返回应该清掉录音的口答记录 id */
export function audioToPrune(attempts: { id: string; at: number; audio?: Blob }[], keep: number = KEEP_AUDIO): string[] {
  return attempts
    .filter((a) => a.audio)
    .sort((a, b) => b.at - a.at)
    .slice(keep)
    .map((a) => a.id);
}

/**
 * 题目分类和词块分类的对应关系：答哪一类题时，哪些分类的词块算“相关”。
 * 顺序就是优先级：并列时排在前面的分类优先。
 */
export const QUESTION_ENTRY_CATEGORIES: Record<string, string[]> = {
  intro: ['c.interview', 'b.interview-talk', 'b.presenting', 'b.hedging'],
  behavioral: ['c.interview', 'b.interview-talk', 'b.hedging', 'b.one-on-one', 'b.small-talk'],
  leadership: ['b.meetings', 'b.planning', 'b.one-on-one', 'b.presenting', 'c.engineering'],
  'system-design': ['c.arch-distributed', 'c.arch-reliability', 'c.cloud-infra', 'c.data', 'c.performance', 'c.patterns'],
  architecture: ['c.patterns', 'c.arch-distributed', 'c.arch-reliability', 'c.software-types', 'c.engineering', 'c.cloud-infra'],
  frontend: ['c.react', 'c.vue', 'c.web-frontend', 'c.frontend-tooling', 'c.nodejs'],
  backend: ['c.java', 'c.python', 'c.nodejs', 'c.data', 'c.patterns', 'c.security'],
  java: ['c.java', 'c.patterns', 'c.engineering'],
  rust: ['c.rust'],
  python: ['c.python', 'c.data'],
  data: ['c.data', 'c.python', 'c.performance'],
  reverse: ['b.interview-talk', 'b.hedging', 'b.meetings', 'c.business'],
};

/**
 * 给一道题挑“已经学过、主题相关”的词块，最多 max 条。
 * 只认产出卡：开口说得出才算学过，D 层没有产出卡所以天然不会入选。
 * 暂停中的（包括顽固条目）不选，题目自带的提示词块不重复出现。
 * 排序先看产出卡的稳定度（记得越牢越优先拿来用），并列时按分类对应顺序、再按词条原有顺序。
 */
export function pickLearnedChunks(
  question: { category: string; chunks: Chunk[] },
  entries: readonly Entry[],
  cards: ReadonlyMap<string, CardState>,
  max = 3,
): Chunk[] {
  const related = QUESTION_ENTRY_CATEGORIES[question.category];
  if (!related) return [];
  const rank = new Map(related.map((c, i) => [c, i] as const));
  const own = new Set(question.chunks.map((c) => c.term.trim().toLowerCase()));
  return entries
    .filter((e) => rank.has(e.category) && !own.has(e.term.trim().toLowerCase()))
    .map((e) => ({ entry: e, card: cards.get(`${e.id}|produce`) }))
    .filter((x) => x.card !== undefined && !x.card.suspended && x.card.reps > 0)
    .sort(
      (a, b) =>
        b.card!.stability - a.card!.stability ||
        rank.get(a.entry.category)! - rank.get(b.entry.category)! ||
        a.entry.order - b.entry.order,
    )
    .slice(0, max)
    .map(({ entry }) => ({ term: entry.term, zh: entry.zh }));
}

export function latestById<T extends { at: number }>(records: T[], idOf: (r: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of records) out.set(idOf(r), Math.max(out.get(idOf(r)) ?? 0, r.at));
  return out;
}
