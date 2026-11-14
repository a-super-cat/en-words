import type { CardState, Direction, Entry } from '../types';
import { isDue } from './queue';
import { DAY } from './schedule';

/**
 * 随机混合练的会话编排：一轮里既学新词条、又复习旧词条。
 * 复习不按逾期死排序，而是按“快忘程度”加权随机抽——记得越不牢、逾期越久越容易被抽中，
 * 但每张到期卡都有机会；新词条先学（intro）后测（quiz），测试卡和学习卡至少隔 4 题。
 */

export type MixedItem =
  | { kind: 'review'; key: string }
  | { kind: 'intro'; entry: Entry }
  | { kind: 'quiz'; entry: Entry; direction: Direction };

export interface MixedPlan {
  items: MixedItem[];
  /** 抽中的复习卡数 */
  reviewCount: number;
  /** 引入的新词条数（每个新词条另有 1 张学习卡 + 1~2 张测试卡） */
  newCount: number;
}

/** 到期积压超过这个数，新学占比从 1/4 降到 1/5，先清积压 */
const BACKLOG_LIMIT = 100;

/** 按 FSRS 遗忘曲线估算“现在还能记起这张卡的概率”：距上次复习越久、稳定度越低，概率越低 */
export function retrievability(card: CardState, now: number): number {
  const since = card.lastReview ?? card.due - card.scheduledDays * DAY;
  const elapsedDays = Math.max(0, (now - since) / DAY);
  const s = Math.max(0.1, card.stability);
  return 1 / (1 + elapsedDays / (9 * s));
}

/** 抽取权重：记得越不牢权重越高，逾期再加一点；留 0.15 的底，保证每张卡都有机会被抽中 */
export function reviewWeight(card: CardState, now: number): number {
  const overdueDays = Math.max(0, (now - card.due) / DAY);
  return 0.15 + (1 - retrievability(card, now)) + 0.05 * Math.min(overdueDays, 10);
}

/** 加权随机抽样（不放回）：权重越大越容易被抽中，但不是必中 */
export function weightedSample<T>(
  items: readonly T[],
  weights: readonly number[],
  k: number,
  rand: () => number = Math.random,
): T[] {
  const keyed = items.map((item, i) => ({
    item,
    key: Math.pow(rand(), 1 / Math.max(0.01, weights[i])),
  }));
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, Math.max(0, k)).map((x) => x.item);
}

export interface MixedInput {
  /** 全部学习卡（函数内部筛到期） */
  cards: Iterable<CardState>;
  /** 候选新词条，顺序沿用 pickNew 的分类轮转结果 */
  newEntries: Entry[];
  /** 一轮的名义题量（复习卡数 + 新词条数 ≈ 这个数，测试卡额外算） */
  size: number;
  now: number;
  rand?: () => number;
}

export function buildMixedSession(input: MixedInput): MixedPlan {
  const rand = input.rand ?? Math.random;
  const due = [...input.cards].filter((c) => isDue(c, input.now));
  const size = Math.max(0, input.size);

  // 配比：新词条默认占 1/4，积压严重时降到 1/5；没有到期卡时全学新的
  const share = due.length > BACKLOG_LIMIT ? 0.2 : 0.25;
  let newCount =
    due.length === 0
      ? Math.min(input.newEntries.length, size)
      : Math.min(input.newEntries.length, Math.floor(size * share));
  let reviewCount = Math.min(due.length, size - newCount);
  // 复习不够抽时，空位让给新词条补满
  if (reviewCount < size - newCount) {
    newCount = Math.min(input.newEntries.length, size - reviewCount);
  }
  const chosenNew = input.newEntries.slice(0, newCount);

  const sampled = weightedSample(
    due,
    due.map((c) => reviewWeight(c, input.now)),
    reviewCount,
    rand,
  );
  const reviews: MixedItem[] = sampled.map((c) => ({ kind: 'review', key: c.key }));
  const intros: MixedItem[] = chosenNew.map((entry) => ({ kind: 'intro', entry }));

  // 编排：先用 2 张复习卡热身，之后复习与学习卡按 2:1 交错
  const seq: MixedItem[] = [];
  let ri = 0;
  let ii = 0;
  while (ri < reviews.length && ri < 2) seq.push(reviews[ri++]);
  while (ri < reviews.length || ii < intros.length) {
    let n = 0;
    while (ri < reviews.length && n < 2) {
      seq.push(reviews[ri++]);
      n++;
    }
    if (ii < intros.length) seq.push(intros[ii++]);
    if (n === 0 && ii >= intros.length) break;
  }

  // 测试卡：插到学习卡至少 4 题之后；同一词条产出在前、识别在后（D 层只有识别）
  for (const entry of chosenNew) {
    const directions: Direction[] = entry.layer === 'D' ? ['recognize'] : ['produce', 'recognize'];
    for (const direction of directions) {
      const introIdx = seq.findIndex((x) => x.kind === 'intro' && x.entry === entry);
      let minPos = (introIdx >= 0 ? introIdx : 0) + 4;
      if (direction === 'recognize') {
        const pIdx = seq.findIndex(
          (x) => x.kind === 'quiz' && x.entry === entry && x.direction === 'produce',
        );
        if (pIdx >= 0) minPos = Math.max(minPos, pIdx + 1);
      }
      seq.splice(Math.min(seq.length, minPos), 0, { kind: 'quiz', entry, direction });
    }
  }

  // 同一词条的复习卡：产出必须排在识别前面（先看过识别答案再做产出题等于漏题）
  const byEntry = new Map<string, { produce: number; recognize: number }>();
  seq.forEach((x, i) => {
    if (x.kind !== 'review') return;
    const [entryId, direction] = x.key.split('|');
    const rec = byEntry.get(entryId) ?? { produce: -1, recognize: -1 };
    rec[direction as Direction] = i;
    byEntry.set(entryId, rec);
  });
  for (const rec of byEntry.values()) {
    if (rec.produce >= 0 && rec.recognize >= 0 && rec.recognize < rec.produce) {
      const tmp = seq[rec.produce];
      seq[rec.produce] = seq[rec.recognize];
      seq[rec.recognize] = tmp;
    }
  }

  return { items: seq, reviewCount: reviews.length, newCount: chosenNew.length };
}
