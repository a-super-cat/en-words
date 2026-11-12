import { describe, expect, it } from 'vitest';
import type { CardState, Entry, Layer } from '../types';
import { buildReviewQueue, dayKey, isDue, pickNewGroups } from './queue';
import { DAY, newCard } from './schedule';
import { forecast, minutesByDay, streakDays } from './stats';

const NOON = new Date(2026, 0, 5, 12, 0, 0).getTime();

const card = (id: string, direction: 'recognize' | 'produce', due: number, suspended = false): CardState => ({
  ...newCard(id, direction, NOON),
  due,
  suspended,
});

const entry = (layer: Layer, category: string, n: number): Entry => ({
  id: `${category}.${n}`,
  term: `${category} ${n}`,
  kind: 'chunk',
  layer,
  category,
  zh: '提示',
  examples: [],
  source: 'builtin',
  order: 0,
});

const many = (layer: Layer, category: string, count: number) =>
  Array.from({ length: count }, (_, i) => entry(layer, category, i));

describe('isDue', () => {
  it('今天之内到期的都算到期，明天的不算，暂停的不算', () => {
    expect(isDue(card('a', 'produce', NOON + 6 * 3600_000), NOON)).toBe(true);
    expect(isDue(card('a', 'produce', NOON - 3 * DAY), NOON)).toBe(true);
    expect(isDue(card('a', 'produce', NOON + DAY), NOON)).toBe(false);
    expect(isDue(card('a', 'produce', NOON - DAY, true), NOON)).toBe(false);
  });
});

describe('buildReviewQueue', () => {
  it('产出卡排在识别卡前面', () => {
    const queue = buildReviewQueue(
      [card('a', 'recognize', NOON), card('a', 'produce', NOON), card('b', 'recognize', NOON), card('b', 'produce', NOON)],
      NOON,
      100,
    );
    expect(queue.map((c) => c.direction)).toEqual(['produce', 'produce', 'recognize', 'recognize']);
  });

  it('超过上限时保留拖得最久的', () => {
    const queue = buildReviewQueue(
      [card('new', 'produce', NOON), card('old', 'produce', NOON - 5 * DAY), card('mid', 'produce', NOON - DAY)],
      NOON,
      2,
    );
    expect(queue.map((c) => c.entryId).sort()).toEqual(['mid', 'old']);
  });
});

describe('pickNewGroups', () => {
  const entries = [...many('C', 'c.react', 12), ...many('C', 'c.java', 12), ...many('B', 'b.meetings', 12)];
  const none = () => false;

  it('每组 5 条，来自同一个分类，保持原有顺序', () => {
    const groups = pickNewGroups(entries, none, new Set(), 20);
    expect(groups.map((g) => g.length)).toEqual([5, 5, 5, 5]);
    for (const g of groups) expect(new Set(g.map((e) => e.category)).size).toBe(1);
    expect(groups[0].map((e) => e.id)).toEqual([0, 1, 2, 3, 4].map((n) => `${groups[0][0].category}.${n}`));
  });

  it('按 C、B、C 的配比轮转，缺少的层由其他层补上', () => {
    const layers = pickNewGroups(entries, none, new Set(), 20).map((g) => g[0].layer);
    expect(layers.slice(0, 3)).toEqual(['C', 'B', 'C']);
    expect(layers).toHaveLength(4);
  });

  it('同一层内先轮到还没学过的分类', () => {
    const groups = pickNewGroups(entries, none, new Set(), 15);
    expect(groups[0][0].category).not.toBe(groups[2][0].category);
  });

  it('跳过已学和被关闭的分类', () => {
    const seen = (id: string) => id.startsWith('c.react');
    const groups = pickNewGroups(entries, seen, new Set(['b.meetings']), 20);
    expect(groups.flat().every((e) => e.category === 'c.java')).toBe(true);
    expect(groups.flat()).toHaveLength(12);
  });

  it('不超过要求的条数', () => {
    expect(pickNewGroups(entries, none, new Set(), 7).flat()).toHaveLength(7);
    expect(pickNewGroups(entries, none, new Set(), 0)).toEqual([]);
  });
});

describe('forecast', () => {
  it('按天统计到期的卡，拖期的算在今天，暂停的和超出范围的不算', () => {
    const cards = [
      card('a', 'produce', NOON - 3 * DAY),
      card('b', 'produce', NOON + 3600_000),
      card('c', 'produce', NOON + DAY),
      card('d', 'recognize', NOON + 2 * DAY),
      card('e', 'produce', NOON + 2 * DAY, true),
      card('f', 'produce', NOON + 10 * DAY),
    ];
    expect(forecast(cards, NOON, 4)).toEqual([2, 1, 1, 0]);
  });
});

describe('minutesByDay', () => {
  it('按天汇总分钟数，最后一项是今天；单次时长有上限', () => {
    const minutes = minutesByDay(
      [
        { at: NOON, ms: 120_000 },
        { at: NOON - 3600_000, ms: 60_000 },
        { at: NOON - DAY, ms: 30 * 60_000 },
        { at: NOON - 5 * DAY, ms: 60_000 },
      ],
      NOON,
      3,
      10 * 60_000,
    );
    expect(minutes).toEqual([0, 10, 3]);
  });
});

describe('streakDays', () => {
  const day = (offset: number) => dayKey(NOON + offset * DAY);

  it('今天还没学时从昨天算起', () => {
    expect(streakDays(new Set([day(-1), day(-2)]), NOON)).toBe(2);
    expect(streakDays(new Set([day(0), day(-1), day(-2)]), NOON)).toBe(3);
  });

  it('中断后重新计数', () => {
    expect(streakDays(new Set([day(0), day(-2), day(-3)]), NOON)).toBe(1);
    expect(streakDays(new Set([day(-2)]), NOON)).toBe(0);
  });
});
