import { describe, expect, it } from 'vitest';
import type { CardState, Entry } from '../types';
import { buildMixedSession, retrievability, reviewWeight, weightedSample } from './mixed';
import { DAY, newCard } from './schedule';

const NOW = 1_700_000_000_000;

/** 可复现的随机数，方便测抽样 */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function dueCard(entryId: string, direction: 'recognize' | 'produce', opts: Partial<CardState> = {}): CardState {
  return {
    ...newCard(entryId, direction, NOW - 30 * DAY),
    due: NOW - DAY,
    stability: 10,
    scheduledDays: 10,
    lastReview: NOW - 11 * DAY,
    reps: 3,
    ...opts,
  };
}

function entry(id: string, layer: Entry['layer'] = 'C'): Entry {
  return {
    id,
    term: id,
    zh: `中文-${id}`,
    kind: 'chunk',
    category: 'c.test',
    layer,
    examples: [{ en: `Use ${id} here.`, zh: '例句' }],
    source: 'builtin',
    order: 0,
  };
}

describe('retrievability / reviewWeight', () => {
  it('记得越不牢、逾期越久，权重越高', () => {
    const fresh = dueCard('a', 'recognize', { stability: 30, lastReview: NOW - 5 * DAY, due: NOW - DAY });
    const stale = dueCard('b', 'recognize', { stability: 2, lastReview: NOW - 40 * DAY, due: NOW - 20 * DAY });
    expect(retrievability(stale, NOW)).toBeLessThan(retrievability(fresh, NOW));
    expect(reviewWeight(stale, NOW)).toBeGreaterThan(reviewWeight(fresh, NOW));
  });
});

describe('weightedSample', () => {
  it('按数量抽取且不重复，同一种子结果可复现', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const weights = [1, 1, 1, 1, 1];
    const s1 = weightedSample(items, weights, 3, lcg(42));
    const s2 = weightedSample(items, weights, 3, lcg(42));
    expect(s1).toEqual(s2);
    expect(new Set(s1).size).toBe(3);
  });
});

describe('buildMixedSession', () => {
  const manyDue = Array.from({ length: 80 }, (_, i) => dueCard(`e${i}`, i % 2 ? 'produce' : 'recognize'));
  const someNew = Array.from({ length: 10 }, (_, i) => entry(`n${i}`));

  it('配比：20 题、积压 80 时新词条占 1/4（5 个），复习抽 15 张', () => {
    const plan = buildMixedSession({ cards: manyDue, newEntries: someNew, size: 20, now: NOW, rand: lcg(7) });
    expect(plan.newCount).toBe(5);
    expect(plan.reviewCount).toBe(15);
    expect(plan.items.filter((x) => x.kind === 'review')).toHaveLength(15);
    expect(plan.items.filter((x) => x.kind === 'intro')).toHaveLength(5);
    // 每个新词条（非 D 层）有产出+识别两张测试卡
    expect(plan.items.filter((x) => x.kind === 'quiz')).toHaveLength(10);
  });

  it('积压超过 100 时新学占比降到 1/5', () => {
    const huge = Array.from({ length: 150 }, (_, i) => dueCard(`h${i}`, 'recognize'));
    const plan = buildMixedSession({ cards: huge, newEntries: someNew, size: 20, now: NOW, rand: lcg(7) });
    expect(plan.newCount).toBe(4);
    expect(plan.reviewCount).toBe(16);
  });

  it('没有到期卡时全学新的；没有新词条时全复习', () => {
    const onlyNew = buildMixedSession({ cards: [], newEntries: someNew, size: 6, now: NOW, rand: lcg(7) });
    expect(onlyNew.newCount).toBe(6);
    expect(onlyNew.reviewCount).toBe(0);
    const onlyReview = buildMixedSession({ cards: manyDue, newEntries: [], size: 10, now: NOW, rand: lcg(7) });
    expect(onlyReview.newCount).toBe(0);
    expect(onlyReview.reviewCount).toBe(10);
  });

  it('复习不够抽时空位由新词条补满', () => {
    const few = [dueCard('a', 'recognize'), dueCard('b', 'produce')];
    const plan = buildMixedSession({ cards: few, newEntries: someNew, size: 10, now: NOW, rand: lcg(7) });
    expect(plan.reviewCount).toBe(2);
    expect(plan.newCount).toBe(8);
  });

  it('同一词条的复习卡产出排在识别前面', () => {
    const pair = [dueCard('x', 'recognize'), dueCard('x', 'produce')];
    const plan = buildMixedSession({ cards: pair, newEntries: [], size: 2, now: NOW, rand: lcg(3) });
    const keys = plan.items.map((x) => (x.kind === 'review' ? x.key : ''));
    expect(keys.indexOf('x|produce')).toBeLessThan(keys.indexOf('x|recognize'));
  });

  it('测试卡和自己的学习卡至少隔 4 题，D 层只有识别测试', () => {
    const plan = buildMixedSession({
      cards: manyDue,
      newEntries: [entry('d1', 'D'), ...someNew.slice(0, 4)],
      size: 20,
      now: NOW,
      rand: lcg(11),
    });
    for (const e of ['d1', 'n0', 'n1', 'n2', 'n3']) {
      const introIdx = plan.items.findIndex((x) => x.kind === 'intro' && x.entry.id === e);
      const quizIdxs = plan.items
        .map((x, i) => ({ x, i }))
        .filter(({ x }) => x.kind === 'quiz' && x.entry.id === e)
        .map(({ i }) => i);
      expect(introIdx).toBeGreaterThanOrEqual(0);
      for (const qi of quizIdxs) expect(qi - introIdx).toBeGreaterThanOrEqual(4);
    }
    const dQuizzes = plan.items.filter((x) => x.kind === 'quiz' && x.entry.id === 'd1');
    expect(dQuizzes).toHaveLength(1);
    expect(dQuizzes[0].kind === 'quiz' && dQuizzes[0].direction).toBe('recognize');
  });

  it('开场是复习卡（有复习时前两题不出现新词条）', () => {
    const plan = buildMixedSession({ cards: manyDue, newEntries: someNew, size: 20, now: NOW, rand: lcg(5) });
    expect(plan.items[0].kind).toBe('review');
    expect(plan.items[1].kind).toBe('review');
  });
});
