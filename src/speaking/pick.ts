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

export function latestById<T extends { at: number }>(records: T[], idOf: (r: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of records) out.set(idOf(r), Math.max(out.get(idOf(r)) ?? 0, r.at));
  return out;
}
