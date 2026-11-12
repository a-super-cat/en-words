/** 解析 CSV：支持双引号包裹、引号内的逗号和换行、`""` 转义。空行会被丢弃。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');

  const endRow = () => {
    row.push(cell);
    cell = '';
    if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      cell = '';
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      endRow();
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}
