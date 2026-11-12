import { describe, expect, it } from 'vitest';
import { loadSpeaking, normalizeQuestions, normalizeScenarios } from '../content/speaking';
import { audioToPrune, latestById, pickNext } from './pick';

const item = (id: string, category: string) => ({ id, category });
const items = [item('a1', 'a'), item('a2', 'a'), item('b1', 'b'), item('b2', 'b')];

describe('pickNext', () => {
  it('什么都没练过时从第一个分类的第一项开始', () => {
    expect(pickNext(items, new Map())?.id).toBe('a1');
  });

  it('先轮到没练过的分类，再在分类里选没练过的', () => {
    expect(pickNext(items, new Map([['a1', 100]]))?.id).toBe('b1');
    expect(
      pickNext(
        items,
        new Map([
          ['a1', 100],
          ['b1', 200],
        ]),
      )?.id,
    ).toBe('a2');
  });

  it('都练过时选最久没练的分类里最久没练的那一项', () => {
    const last = new Map([
      ['a1', 300],
      ['a2', 400],
      ['b1', 200],
      ['b2', 100],
    ]);
    expect(pickNext(items, last)?.id).toBe('b2');
  });

  it('可以排除当前这一项；没有可选的就返回 undefined', () => {
    expect(pickNext(items, new Map(), 'a1')?.id).toBe('a2');
    expect(pickNext([item('a1', 'a')], new Map(), 'a1')).toBeUndefined();
    expect(pickNext([], new Map())).toBeUndefined();
  });
});

describe('audioToPrune', () => {
  const blob = new Blob(['x']);
  const attempts = [
    { id: 'old', at: 1, audio: blob },
    { id: 'none', at: 2 },
    { id: 'mid', at: 3, audio: blob },
    { id: 'new', at: 4, audio: blob },
  ];

  it('只清掉超出保留数量的最旧录音，没有录音的记录不算数', () => {
    expect(audioToPrune(attempts, 2)).toEqual(['old']);
    expect(audioToPrune(attempts, 3)).toEqual([]);
    expect(audioToPrune(attempts, 0).sort()).toEqual(['mid', 'new', 'old']);
  });
});

describe('latestById', () => {
  it('取每个 id 最近一次的时间', () => {
    const last = latestById(
      [
        { q: 'a', at: 5 },
        { q: 'b', at: 2 },
        { q: 'a', at: 9 },
      ],
      (r) => r.q,
    );
    expect([...last]).toEqual([
      ['a', 9],
      ['b', 2],
    ]);
  });
});

describe('题库和场景的加载', () => {
  const question = (id: string) => ({ id, prompt: 'Why?', zh: '为什么？', outline: ['a', 'b', 'c'], chunks: [] });

  it('分类按学习顺序排，不按文件名；缺省字段补空数组', () => {
    const { categories, questions } = normalizeQuestions({
      'q-backend.json': { category: 'backend', title: '后端', questions: [question('b1')] },
      'q-intro.json': { category: 'intro', title: '自我介绍', questions: [question('i1')] },
      'q-zzz.json': { category: 'unknown', title: '其他', questions: [question('z1')] },
    });
    expect(categories.map((c) => c.key)).toEqual(['intro', 'backend', 'unknown']);
    expect(questions.map((q) => q.id)).toEqual(['i1', 'b1', 'z1']);
    expect(questions[0].followUps).toEqual([]);
  });

  it('场景里对方的轮次没有 chunks 时补空数组', () => {
    const { scenarios } = normalizeScenarios({
      's-standup.json': {
        category: 'standup',
        title: '站会',
        scenarios: [
          {
            id: 's1',
            title: '标题',
            setting: '背景',
            turns: [
              { speaker: 'them', name: 'Sarah', en: 'Hi.', zh: '嗨。' },
              { speaker: 'me', en: 'Hello.', zh: '你打招呼。', chunks: [{ term: 'Hello', zh: '你好' }] },
            ],
          },
        ],
      },
    });
    expect(scenarios[0].turns.map((t) => t.chunks.length)).toEqual([0, 1]);
  });

  it('内置内容里的 id 唯一', () => {
    const { questions, scenarios } = loadSpeaking();
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
  });
});
