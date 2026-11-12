import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('解析普通行，丢弃空行，兼容 CRLF 和 BOM', () => {
    expect(parseCsv('﻿term,zh\r\nroll back,回滚\r\n\r\nhotfix,热修复')).toEqual([
      ['term', 'zh'],
      ['roll back', '回滚'],
      ['hotfix', '热修复'],
    ]);
  });

  it('处理引号里的逗号、换行和转义引号', () => {
    expect(parseCsv('"push back, gently","委婉地反对","He said ""no"".\nTwice."')).toEqual([
      ['push back, gently', '委婉地反对', 'He said "no".\nTwice.'],
    ]);
  });

  it('保留行内的空单元格', () => {
    expect(parseCsv('term,,,,B')).toEqual([['term', '', '', '', 'B']]);
  });
});
