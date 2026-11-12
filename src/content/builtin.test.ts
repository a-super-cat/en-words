import { describe, expect, it } from 'vitest';
import { loadBuiltin, normalize, type RawFile } from './builtin';

const file = (category: string, terms: string[]): RawFile => ({
  layer: 'C',
  category,
  title: category,
  entries: terms.map((term) => ({ term, kind: 'chunk', zh: '提示' })),
});

describe('normalize', () => {
  it('同一分类的多个文件合并，id 由层、分类和 term 生成', () => {
    const { entries, categories } = normalize({
      'c-react-2.json': file('react', ['stale closure']),
      'c-react-1.json': file('react', ["Don't re-render"]),
    });
    expect(categories).toEqual([{ key: 'c.react', layer: 'C', title: 'react' }]);
    expect(entries.map((e) => e.id)).toEqual(['c.react.dont-re-render', 'c.react.stale-closure']);
    expect(entries.map((e) => e.order)).toEqual([0, 1]);
  });

  it('重复的条目只保留第一条', () => {
    const { entries } = normalize({ 'a.json': file('react', ['key', 'key']) });
    expect(entries).toHaveLength(1);
  });
});

describe('内置内容', () => {
  it('能加载，且每条的 id 唯一', () => {
    const { entries } = loadBuiltin();
    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });
});
