import { describe, expect, it } from 'vitest';
import { DAY } from '../srs/schedule';
import type { Entry } from '../types';
import type { DictWord } from './dictionary';
import {
  buildWordQueue,
  etymUrl,
  findExample,
  introducedToday,
  newWordCard,
  rateWordCard,
  wordStatus,
} from './words';

const NOW = new Date('2026-11-14T10:00:00').getTime();

const dw = (word: string, rank: number): DictWord => ({
  word,
  zh: '',
  en: '',
  phonetic: '',
  rank,
  tech: false,
});

describe('etymUrl', () => {
  it('小写并编码', () => {
    expect(etymUrl('Cache')).toBe('https://www.etymonline.com/word/cache');
  });
});

describe('buildWordQueue', () => {
  const ranked = [dw('alpha', 100), dw('beta', 200), dw('gamma', 300), dw('delta', 400)];

  it('到期卡按到期时间排，新词生词本优先、再按词频', () => {
    const old = { ...newWordCard('beta', NOW - 30 * DAY), due: NOW - 2 * DAY };
    const q = buildWordQueue({
      cards: [old],
      notebookWords: ['Gamma'],
      ranked,
      marks: new Map(),
      knownRank: 50,
      newLimit: 10,
      now: NOW,
    });
    expect(q.due.map((c) => c.word)).toEqual(['beta']);
    // beta 已经有卡，不再当新词；gamma 来自生词本排第一
    expect(q.fresh).toEqual([
      { word: 'gamma', fromNotebook: true },
      { word: 'alpha', fromNotebook: false },
      { word: 'delta', fromNotebook: false },
    ]);
  });

  it('跳过默认认识范围和标过认识的词，新词受上限截断', () => {
    const q = buildWordQueue({
      cards: [],
      notebookWords: [],
      ranked,
      marks: new Map([['gamma', 'known' as const]]),
      knownRank: 150,
      newLimit: 1,
      now: NOW,
    });
    expect(q.fresh).toEqual([{ word: 'beta', fromNotebook: false }]);
  });

  it('暂停的卡不算到期', () => {
    const paused = { ...newWordCard('beta', NOW - DAY), due: NOW - DAY, suspended: true };
    const q = buildWordQueue({
      cards: [paused],
      notebookWords: [],
      ranked,
      marks: new Map(),
      knownRank: 50,
      newLimit: 5,
      now: NOW,
    });
    expect(q.due).toEqual([]);
    expect(q.fresh.map((f) => f.word)).not.toContain('beta');
  });
});

describe('rateWordCard / wordStatus / introducedToday', () => {
  it('新卡评分后进入学习中，due 推到将来', () => {
    const card = newWordCard('serendipity', NOW);
    expect(wordStatus(card)).toBe('learning');
    const rated = rateWordCard(card, 3, NOW);
    expect(rated.reps).toBe(1);
    expect(rated.due).toBeGreaterThan(NOW);
    expect(rated.word).toBe('serendipity');
    expect(rated.createdAt).toBe(NOW);
  });

  it('introducedToday 只数今天建的卡', () => {
    const a = newWordCard('a', NOW);
    const b = newWordCard('b', NOW - 2 * DAY);
    expect(introducedToday([a, b], NOW)).toBe(1);
  });
});

describe('findExample', () => {
  const entries = [
    {
      id: 'x',
      examples: [{ en: 'The cache is stale.', zh: '缓存过期了。' }],
    },
  ] as unknown as Entry[];

  it('按整词匹配例句', () => {
    expect(findExample('cache', entries)?.en).toBe('The cache is stale.');
    expect(findExample('cat', entries)).toBeUndefined();
  });
});
