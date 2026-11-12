import type { Category, Entry, Kind, Layer, Pair, Register } from '../types';
import { slug } from './slug';

export interface RawEntry {
  id?: string;
  term: string;
  kind: Kind;
  zh: string;
  ipa?: string;
  examples?: Pair[];
  situation?: Pair;
  collocations?: string[];
  register?: Register;
  note?: string;
}

export interface RawFile {
  layer: Layer;
  category: string;
  title: string;
  entries: RawEntry[];
}

export interface Content {
  entries: Entry[];
  categories: Category[];
}

export const categoryKey = (layer: Layer, category: string) => `${layer.toLowerCase()}.${category}`;

/** 把内容文件合并成有序的条目列表。文件按路径排序，同一分类的多个文件自动合并。 */
export function normalize(files: Record<string, RawFile>): Content {
  const entries: Entry[] = [];
  const categories = new Map<string, Category>();
  const seen = new Set<string>();

  for (const path of Object.keys(files).sort()) {
    const file = files[path];
    const key = categoryKey(file.layer, file.category);
    if (!categories.has(key)) categories.set(key, { key, layer: file.layer, title: file.title });

    for (const raw of file.entries) {
      const id = raw.id ?? `${key}.${slug(raw.term)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({
        id,
        term: raw.term,
        kind: raw.kind,
        layer: file.layer,
        category: key,
        zh: raw.zh,
        ipa: raw.ipa,
        examples: raw.examples ?? [],
        situation: raw.situation,
        collocations: raw.collocations,
        register: raw.register,
        note: raw.note,
        source: 'builtin',
        order: entries.length,
      });
    }
  }
  return { entries, categories: [...categories.values()] };
}

export function loadBuiltin(): Content {
  const files = import.meta.glob<RawFile>('../../content/entries/*.json', { eager: true, import: 'default' });
  return normalize(files);
}
