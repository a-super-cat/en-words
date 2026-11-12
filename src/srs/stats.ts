import type { CardState, Entry } from '../types';
import { dayKey, startOfDay } from './queue';
import { cardKey, DAY } from './schedule';

/** 主方向的记忆稳定度达到这个天数算“已掌握” */
export const MATURE_DAYS = 21;

export type EntryStatus = 'new' | 'learning' | 'mature' | 'suspended';

export interface Progress {
  total: number;
  learned: number;
  mature: number;
}

/** D 层只练识别，其余层以产出为准 */
export function mainCard(entry: Entry, cards: ReadonlyMap<string, CardState>): CardState | undefined {
  return entry.layer === 'D'
    ? cards.get(cardKey(entry.id, 'recognize'))
    : (cards.get(cardKey(entry.id, 'produce')) ?? cards.get(cardKey(entry.id, 'recognize')));
}

export function entryStatus(entry: Entry, cards: ReadonlyMap<string, CardState>): EntryStatus {
  const card = mainCard(entry, cards);
  if (!card) return 'new';
  if (card.suspended) return 'suspended';
  return card.stability >= MATURE_DAYS ? 'mature' : 'learning';
}

export function progressByCategory(entries: Entry[], cards: ReadonlyMap<string, CardState>): Map<string, Progress> {
  const out = new Map<string, Progress>();
  for (const e of entries) {
    let p = out.get(e.category);
    if (!p) out.set(e.category, (p = { total: 0, learned: 0, mature: 0 }));
    p.total++;
    const status = entryStatus(e, cards);
    if (status !== 'new') p.learned++;
    if (status === 'mature') p.mature++;
  }
  return out;
}

/**
 * 未来若干天每天到期的复习量。第 0 项是今天，包含已经拖到今天的；暂停的卡不算。
 * 这是按当前排期算的，实际会随每次复习的评分变化。
 */
export function forecast(cards: Iterable<CardState>, now: number, days: number): number[] {
  const out = new Array<number>(days).fill(0);
  const today = startOfDay(now);
  for (const c of cards) {
    if (c.suspended) continue;
    const offset = Math.max(0, Math.floor((startOfDay(c.due) - today) / DAY));
    if (offset < days) out[offset]++;
  }
  return out;
}

/**
 * 过去若干天每天的学习分钟数，最后一项是今天。records 里的 ms 是每次活动的时长，
 * 单次超过 cap 的按 cap 计，避免中途离开把时长撑大。
 */
export function minutesByDay(records: { at: number; ms: number }[], now: number, days: number, cap = 60_000): number[] {
  const out = new Array<number>(days).fill(0);
  const today = startOfDay(now);
  for (const r of records) {
    const offset = Math.round((today - startOfDay(r.at)) / DAY);
    if (offset >= 0 && offset < days) out[days - 1 - offset] += Math.min(r.ms, cap) / 60_000;
  }
  return out.map((m) => Math.round(m));
}

/** 连续学习天数。今天还没学时从昨天算起，不会因为今天还没开始就清零。 */
export function streakDays(days: ReadonlySet<string>, now: number): number {
  let t = days.has(dayKey(now)) ? now : now - DAY;
  let n = 0;
  while (days.has(dayKey(t))) {
    n++;
    t -= DAY;
  }
  return n;
}
