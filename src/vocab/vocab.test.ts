import { describe, expect, it } from 'vitest';
import { analyze, sentenceAt, statusOf, type KnownModel } from './analyze';
import { bandOf, bandRange, estimate, sampleBand, shouldStop } from './assess';
import { buildDictionary, guessLemmas, loadDictionary } from './dictionary';

const dict = buildDictionary({
  words: [
    ['the', 'art. 那', '', ''],
    ['be', 'v. 是', '', 'is are was were been being'],
    ['give', 'v. 给', '', 'gave given giving gives'],
    ['run', 'v. 跑', '', 'ran running runs'],
    ['quick', 'a. 快的', '', 'quicker quickest'],
    ['study', 'v. 学习', '', 'studied studying studies'],
    ['do', 'v. 做', '', 'did done doing does'],
    ['mitigate', 'vt. 缓解', '', 'mitigated mitigating mitigates'],
    ['cache', 'n. 缓存', '', ''],
    ['are', 'n. 公亩', '', ''],
  ],
  extra: [['latency', '[计] 延迟', '', '', 1]],
});

const model = (over: Partial<KnownModel> = {}): KnownModel => ({
  knownRank: 7,
  marks: new Map(),
  studying: new Set(),
  mastered: new Set(),
  ...over,
});

describe('词形还原', () => {
  it('用词典里的变形表还原，大小写不敏感', () => {
    expect(dict.resolve('Gave')?.word).toBe('give');
    expect(dict.resolve('running')?.word).toBe('run');
    expect(dict.resolve('were')?.word).toBe('be');
  });

  it('既是词条又是变形时，取词频更高的解释', () => {
    // are 既是 be 的变形，也是罕见的名词“公亩”
    expect(dict.resolve('are')?.word).toBe('be');
    expect(dict.resolve('cache')?.word).toBe('cache');
  });

  it('变形表里没有时按词尾规则猜', () => {
    expect(dict.resolve('caches')?.word).toBe('cache');
    expect(dict.resolve('cached')?.word).toBe('cache');
    expect(dict.resolve('quickly')?.word).toBe('quick');
    expect(guessLemmas('stopped')).toContain('stop');
    expect(guessLemmas('replies')).toContain('reply');
  });

  it('处理缩写形式', () => {
    expect(dict.resolve("don't")?.word).toBe('do');
    expect(dict.resolve('cache’s')?.word).toBe('cache');
  });

  it('词典里没有的词返回 undefined', () => {
    expect(dict.resolve('Kubernetes')).toBeUndefined();
  });

  it('排名从 1 开始，补充词没有排名', () => {
    expect(dict.resolve('the')?.rank).toBe(1);
    expect(dict.resolve('mitigate')?.rank).toBe(8);
    expect(dict.resolve('latency')).toMatchObject({ rank: null, tech: true });
  });
});

describe('statusOf', () => {
  const mitigate = dict.resolve('mitigate');

  it('默认按词频排名判断，技术补充词默认认识', () => {
    expect(statusOf('give', dict.resolve('give'), model())).toBe('known');
    expect(statusOf('mitigate', mitigate, model())).toBe('unknown');
    expect(statusOf('latency', dict.resolve('latency'), model())).toBe('known');
    expect(statusOf('kubernetes', undefined, model())).toBe('offlist');
  });

  it('手动标记优先于排名，复习状态优先于标记', () => {
    expect(statusOf('mitigate', mitigate, model({ marks: new Map([['mitigate', 'known']]) }))).toBe('known');
    expect(statusOf('give', dict.resolve('give'), model({ marks: new Map([['give', 'unknown']]) }))).toBe('unknown');
    const marked = new Map([['mitigate', 'unknown' as const]]);
    expect(statusOf('mitigate', mitigate, model({ marks: marked, studying: new Set(['mitigate']) }))).toBe('learning');
    expect(statusOf('mitigate', mitigate, model({ marks: marked, mastered: new Set(['mitigate']) }))).toBe('known');
  });
});

describe('analyze', () => {
  const text = 'We cached the data. Caching mitigates latency, and it mitigated load on Kubernetes.';
  const result = analyze(text, dict, model());

  it('把原文切成片段，拼回去和原文一致', () => {
    expect(result.segments.map((s) => s.text).join('')).toBe(text);
  });

  it('生词按原形合并计数，带上第一次出现的句子', () => {
    const mitigate = result.unknown.find((u) => u.key === 'mitigate');
    expect(mitigate).toMatchObject({ count: 2, sentence: 'Caching mitigates latency, and it mitigated load on Kubernetes.' });
    expect(result.unknown[0].count).toBeGreaterThanOrEqual(result.unknown.at(-1)!.count);
  });

  it('词典里没有的词不计入覆盖率', () => {
    // 13 个词里，测试用的小词典只认识 6 个：cached、the、Caching、mitigates、latency、mitigated
    expect(result.offlist).toContain('Kubernetes');
    expect(result.total).toBe(13);
    expect(result.counted).toBe(6);
    // 其中 the 在默认认识的排名内，latency 是技术词
    expect(result.known).toBe(2);
    expect(result.coverage).toBeCloseTo(2 / 6);
  });

  it('空文本的覆盖率是 1，不会除以零', () => {
    expect(analyze('', dict, model())).toMatchObject({ total: 0, coverage: 1, unknown: [] });
  });
});

describe('sentenceAt', () => {
  it('取出位置所在的整句', () => {
    const text = 'First one. Second has the word. Third.';
    expect(sentenceAt(text, text.indexOf('word'))).toBe('Second has the word.');
    expect(sentenceAt('No punctuation here', 3)).toBe('No punctuation here');
  });
});

describe('测评', () => {
  const band = (n: number, known: number) => ({ band: n, known, total: 10 });

  it('频段和排名互相换算', () => {
    expect(bandOf(1)).toBe(1);
    expect(bandOf(1000)).toBe(1);
    expect(bandOf(1001)).toBe(2);
    expect(bandRange(3)).toEqual([2001, 3000]);
  });

  it('连续两个频段几乎都不认识时提前结束', () => {
    expect(shouldStop([band(1, 10), band(2, 2)])).toBe(false);
    expect(shouldStop([band(1, 10), band(2, 2), band(3, 1)])).toBe(true);
    expect(shouldStop([band(1, 2)])).toBe(false);
  });

  it('词汇量是各频段比例之和；默认认识的范围是连续达标的频段', () => {
    const e = estimate([band(1, 10), band(2, 9), band(3, 8), band(4, 5), band(5, 9), band(6, 1)]);
    expect(e.size).toBe(4200);
    expect(e.knownRank).toBe(3000);
  });

  it('最高频的一段即使没达标，默认认识的范围也不低于 1000', () => {
    expect(estimate([band(1, 6), band(2, 1), band(3, 0)]).knownRank).toBe(1000);
  });

  it('从指定频段抽词，不重复', async () => {
    const real = await loadDictionary();
    const sample = sampleBand(real.ranked, 4, 10);
    expect(sample).toHaveLength(10);
    expect(new Set(sample.map((w) => w.word)).size).toBe(10);
    expect(sample.every((w) => w.rank! > 3000 && w.rank! <= 4000)).toBe(true);
  });
});
