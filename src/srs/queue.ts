import type { CardState, Entry, Layer } from '../types';
import { DAY } from './schedule';

export const GROUP_SIZE = 5;

/** 新内容的分层配比：每 4 组里 C 层 2 组、B 层 1 组、A 或 D 层 1 组；某层没有可学内容时由其他层补上 */
const LAYER_CYCLE: Layer[][] = [['C'], ['B'], ['C'], ['A', 'D']];

export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const endOfDay = (now: number) => startOfDay(now) + DAY - 1;

/** 备份提醒的间隔（天）：距上次导出备份满这么多天，今日页就提醒 */
export const BACKUP_REMIND_DAYS = 7;

/** 距上次备份过了几个自然日；从没备份过（null）返回 null */
export function daysSinceBackup(lastBackupAt: number | null, now: number): number | null {
  if (lastBackupAt === null) return null;
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(lastBackupAt)) / DAY));
}

export function dayKey(time: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 今天之内到期的都算到期，这样一天只需要复习一轮 */
export const isDue = (card: CardState, now: number) => !card.suspended && card.due <= endOfDay(now);

export function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 今天的复习队列。超过上限时保留拖得最久的；产出卡排在识别卡前面，
 * 因为先看过识别卡的答案再做产出题等于漏题。各自内部打乱，让不同主题混排。
 */
export function buildReviewQueue(
  cards: Iterable<CardState>,
  now: number,
  limit: number,
  rand: () => number = Math.random,
): CardState[] {
  const due = [...cards]
    .filter((c) => isDue(c, now))
    .sort((a, b) => a.due - b.due)
    .slice(0, limit);
  return [
    ...shuffle(
      due.filter((c) => c.direction === 'produce'),
      rand,
    ),
    ...shuffle(
      due.filter((c) => c.direction === 'recognize'),
      rand,
    ),
  ];
}

/**
 * 挑出接下来要学的新内容，按 5 条一组返回，每组来自同一个分类、保持文件里的顺序。
 * 分类在各层内轮转，优先学得最少的分类。
 */
export function pickNewGroups(
  entries: Entry[],
  seen: (entryId: string) => boolean,
  disabled: ReadonlySet<string>,
  count: number,
): Entry[][] {
  const pools = new Map<string, { layer: Layer; total: number; unseen: Entry[] }>();
  for (const e of entries) {
    let pool = pools.get(e.category);
    if (!pool) pools.set(e.category, (pool = { layer: e.layer, total: 0, unseen: [] }));
    pool.total++;
    if (!disabled.has(e.category) && !seen(e.id)) pool.unseen.push(e);
  }

  const learnedShare = new Map([...pools].map(([key, p]) => [key, 1 - p.unseen.length / p.total]));
  const lastTurn = new Map<string, number>();
  const choose = (layers: Layer[] | null): string | undefined =>
    [...pools]
      .filter(([, p]) => p.unseen.length > 0 && (layers === null || layers.includes(p.layer)))
      .map(([key]) => key)
      .sort(
        (a, b) =>
          (lastTurn.get(a) ?? -1) - (lastTurn.get(b) ?? -1) ||
          learnedShare.get(a)! - learnedShare.get(b)! ||
          a.localeCompare(b),
      )[0];

  const groups: Entry[][] = [];
  let remaining = count;
  for (let turn = 0; remaining > 0; turn++) {
    const key = choose(LAYER_CYCLE[turn % LAYER_CYCLE.length]) ?? choose(null);
    if (key === undefined) break;
    const group = pools.get(key)!.unseen.splice(0, Math.min(GROUP_SIZE, remaining));
    groups.push(group);
    remaining -= group.length;
    lastTurn.set(key, turn);
  }
  return groups;
}
