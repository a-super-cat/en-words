import { describe, expect, it } from 'vitest';
import type { CardState, Entry } from '../types';
import { buildPrompt } from './prompt';
import { newCard } from './schedule';

const full: Entry = {
  id: 'c.arch.spof',
  term: 'single point of failure',
  kind: 'chunk',
  layer: 'C',
  category: 'c.arch',
  zh: '单点故障',
  examples: [{ en: 'The primary database was a single point of failure.', zh: '主库是单点故障。' }],
  situation: { zh: '面试官问：旧架构最大的风险是什么？', en: 'It had a single point of failure.' },
  source: 'builtin',
  order: 0,
};

const produce = (stability: number): CardState => ({ ...newCard(full.id, 'produce', 0), stability });
const recognize = (reps: number): CardState => ({ ...newCard(full.id, 'recognize', 0), reps });

describe('产出题', () => {
  it('随稳定度从提示回忆升到整句翻译，再到情境应答', () => {
    expect(buildPrompt(produce(2), full, undefined, true)).toMatchObject({ mode: 'cue', question: '单点故障' });
    expect(buildPrompt(produce(8), full, undefined, true)).toMatchObject({
      mode: 'sentence',
      question: '主库是单点故障。',
      target: '单点故障',
    });
    expect(buildPrompt(produce(40), full, undefined, true)).toMatchObject({
      mode: 'situation',
      answer: 'It had a single point of failure.',
    });
  });

  it('缺少情境或例句时退回低一级的题型', () => {
    const noSituation = { ...full, situation: undefined };
    expect(buildPrompt(produce(40), noSituation, undefined, true).mode).toBe('sentence');
    const bare = { ...noSituation, examples: [] };
    expect(buildPrompt(produce(40), bare, undefined, true).mode).toBe('cue');
  });

  it('优先考自己写的句子', () => {
    const note = { entryId: full.id, en: 'Our gateway was a single point of failure.', zh: '我们的网关是单点故障。' };
    expect(buildPrompt(produce(8), full, note, true)).toMatchObject({ question: note.zh, answer: note.en });
    const half = { ...note, zh: '' };
    expect(buildPrompt(produce(8), full, half, true).question).toBe('主库是单点故障。');
  });
});

describe('识别题', () => {
  it('B 层每 3 次里有 1 次改成听辨，其他层不改', () => {
    const b = { ...full, layer: 'B' as const };
    expect([0, 1, 2, 3, 4, 5].map((reps) => buildPrompt(recognize(reps), b, undefined, true).mode)).toEqual([
      'recognize',
      'recognize',
      'listen',
      'recognize',
      'recognize',
      'listen',
    ]);
    expect(buildPrompt(recognize(2), full, undefined, true).mode).toBe('recognize');
  });

  it('浏览器不能朗读时不出听辨题', () => {
    const b = { ...full, layer: 'B' as const };
    expect(buildPrompt(recognize(2), b, undefined, false).mode).toBe('recognize');
  });
});
