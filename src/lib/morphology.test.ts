import { describe, expect, it } from 'vitest';
import { decompose, formatParts } from './morphology';

const kinds = (word: string, opts?: Parameters<typeof decompose>[1]) =>
  decompose(word, opts)?.map((p) => `${p.kind}:${p.text}`);

describe('decompose', () => {
  it('前缀 + 词根 + 后缀都拆得出', () => {
    expect(kinds('unpredictable')).toEqual(['prefix:un', 'prefix:pre', 'root:dict', 'suffix:able']);
    expect(kinds('transport')).toEqual(['prefix:trans', 'root:port']);
    expect(kinds('interrupt')).toEqual(['prefix:inter', 'root:rupt']);
    expect(kinds('description')).toEqual(['prefix:de', 'root:scrip', 'suffix:tion']);
  });

  it('词干本身是词时走词干兜底（派生后缀）', () => {
    const opts = { isWord: (s: string) => s === 'hope', glossOf: () => 'n. 希望' };
    expect(kinds('hopeless', opts)).toEqual(['base:hope', 'suffix:less']);
  });

  it('屈折后缀不走兜底，避免 butter 这类误拆', () => {
    const opts = { isWord: (s: string) => s === 'butt' || s === 'teach' };
    expect(decompose('butter', opts)).toBeNull();
    expect(decompose('teacher', opts)).toBeNull();
  });

  it('拆不准的返回 null', () => {
    expect(decompose('uncle')).toBeNull();
    expect(decompose('carpet')).toBeNull();
    expect(decompose('read')).toBeNull();
    expect(decompose('go')).toBeNull();
  });

  it('词根本身单独成词时也能标出来', () => {
    expect(kinds('port')).toEqual(['root:port']);
  });
});

describe('formatParts', () => {
  it('拼成一行，前后缀带连字符，含义去掉来源注', () => {
    const parts = decompose('unpredictable')!;
    expect(formatParts(parts)).toBe('un-（不、非；相反动作） + pre-（在…之前） + dict（说） + -able（能…的、可…的）');
  });
});
