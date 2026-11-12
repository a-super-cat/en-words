import { describe, expect, it } from 'vitest';
import type { CardState, Rating } from '../types';
import { DAY, LEECH_LAPSES, newCard, previewDays, produceStage, rateCard } from './schedule';

const T0 = new Date(2026, 0, 5, 9, 0, 0).getTime();

/** 每次都在到期当天复习，返回最后的卡片 */
function review(card: CardState, ratings: Rating[]): CardState {
  return ratings.reduce((c, r) => rateCard(c, r, Math.max(c.due, T0)), card);
}

describe('rateCard', () => {
  it('新卡评分后直接按天排期，没有分钟级的学习步骤', () => {
    const good = rateCard(newCard('e', 'produce', T0), 3, T0);
    expect(good.due - T0).toBeGreaterThanOrEqual(2 * DAY);
    expect(good.reps).toBe(1);
    expect(good.lastReview).toBe(T0);

    const again = rateCard(newCard('e', 'produce', T0), 1, T0);
    expect(again.due - T0).toBeGreaterThanOrEqual(DAY - 1);
    expect(again.due - T0).toBeLessThanOrEqual(2 * DAY);
    expect(again.lapses).toBe(0);
  });

  it('评分越高，下次复习排得越远', () => {
    const card = rateCard(newCard('e', 'produce', T0), 3, T0);
    const days = previewDays(card, card.due);
    expect(days[1]).toBeLessThanOrEqual(days[2]);
    expect(days[2]).toBeLessThanOrEqual(days[3]);
    expect(days[3]).toBeLessThan(days[4]);
  });

  it('不修改传入的卡片', () => {
    const card = newCard('e', 'recognize', T0);
    const snapshot = { ...card };
    rateCard(card, 3, T0);
    expect(card).toEqual(snapshot);
  });
});

describe('produceStage', () => {
  it('连续记得时逐级升到情境应答', () => {
    const stages: number[] = [];
    let card = rateCard(newCard('e', 'produce', T0), 3, T0);
    for (let i = 0; i < 3; i++) {
      stages.push(produceStage(card));
      card = rateCard(card, 3, card.due);
    }
    expect(stages).toEqual([1, 2, 3]);
  });

  it('自称已经会了的内容跳过提示回忆，约一周后从整句翻译开始考', () => {
    const known = rateCard(newCard('e', 'produce', T0), 4, T0);
    expect(produceStage(known)).toBe(2);
    expect(known.due - T0).toBeGreaterThanOrEqual(5 * DAY);
  });

  it('忘记后退回提示回忆', () => {
    const mature = review(rateCard(newCard('e', 'produce', T0), 3, T0), [3, 3]);
    expect(produceStage(mature)).toBe(3);
    expect(produceStage(rateCard(mature, 1, mature.due))).toBe(1);
  });
});

describe('顽固条目', () => {
  it(`累计忘记 ${LEECH_LAPSES} 次后自动暂停`, () => {
    let card = rateCard(newCard('e', 'produce', T0), 3, T0);
    for (let i = 0; i < LEECH_LAPSES - 1; i++) card = rateCard(card, 1, card.due);
    expect(card.lapses).toBe(LEECH_LAPSES - 1);
    expect(card.suspended).toBe(false);

    card = rateCard(card, 1, card.due);
    expect(card.lapses).toBe(LEECH_LAPSES);
    expect(card.suspended).toBe(true);
    expect(card.leech).toBe(true);
  });
});
