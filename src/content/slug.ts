// 必须和 scripts/validate-content.mjs 里的 slug 保持一致：条目 id 由它生成，改动会让已有学习记录对不上。
export function slug(term: string): string {
  return term
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
