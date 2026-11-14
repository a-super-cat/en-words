import { describe, expect, it } from 'vitest';
import { DAY } from '../srs/schedule';
import type { Entry } from '../types';
import type { DictWord } from './dictionary';
import {
  bandProgress,
  buildWordQueue,
  buildWordSession,
  etymUrl,
  findExample,
  introducedToday,
  makeCloze,
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

  it('四级优先：生词本 > 标过不认识 > 词条在学 > 词频；词条已掌握的跳过', () => {
    const q = buildWordQueue({
      cards: [],
      notebookWords: ['delta'],
      ranked,
      marks: new Map([['gamma', 'unknown' as const]]),
      knownRank: 10000,
      newLimit: 10,
      now: NOW,
      studying: new Set(['beta']),
      mastered: new Set(['alpha']),
    });
    // alpha 虽然词频最高，但词条线已掌握，不推；knownRank 拉满也不影响前三级
    expect(q.fresh.map((f) => f.word)).toEqual(['delta', 'gamma', 'beta']);
  });
});

describe('buildWordSession', () => {
  it('新词先 intro 混编进复习流，最后统一以 test 再考一遍', () => {
    const due = ['d1', 'd2', 'd3', 'd4'].map((w) => newWordCard(w, NOW - DAY));
    const session = buildWordSession(due, [
      { word: 'n1', fromNotebook: true },
      { word: 'n2', fromNotebook: false },
    ]);
    expect(session.map((s) => `${s.word}:${s.mode}`)).toEqual([
      'd1:test',
      'd2:test',
      'n1:intro',
      'd3:test',
      'd4:test',
      'n2:intro',
      'n1:test',
      'n2:test',
    ]);
    expect(session.find((s) => s.word === 'n1')?.kind).toBe('notebook');
  });

  it('没有复习卡时 intro 在前、test 在后', () => {
    const session = buildWordSession([], [{ word: 'n1', fromNotebook: false }]);
    expect(session.map((s) => s.mode)).toEqual(['intro', 'test']);
  });
});

describe('makeCloze', () => {
  it('把例句里的目标词挖空', () => {
    expect(makeCloze('cache', 'The cache is stale.')).toBe('The ______ is stale.');
    expect(makeCloze('cache', 'We love caching.')).toBeNull();
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

describe('bandProgress', () => {
  it('按段汇总卡状态和认识标记', () => {
    const ranked = [dw('a', 1), dw('b', 2), dw('c', 1500), dw('d', 1600)];
    const mastered = { ...newWordCard('a', NOW), stability: 30 };
    const learning = newWordCard('c', NOW);
    const rows = bandProgress(ranked, [mastered, learning], new Map([['b', 'known' as const]]), 1000);
    expect(rows).toEqual([
      { band: 1, total: 2, known: 1, mastered: 1, learning: 0, suspended: 0, remaining: 0 },
      { band: 2, total: 2, known: 0, mastered: 0, learning: 1, suspended: 0, remaining: 1 },
    ]);
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
