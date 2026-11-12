// 构词拆解：用精选词素表（content/wordlists/morphemes.json）把单词拆成前缀/词根/后缀，
// 帮着记词。这只是构词提示，不是学术词源；拆不准的宁可不拆（返回 null），不硬凑。
import morphemesData from '../../content/wordlists/morphemes.json';

export interface Morpheme {
  form: string;
  forms?: string[];
  meaning: string;
  en: string;
}

export interface MorphemeData {
  prefixes: Morpheme[];
  roots: Morpheme[];
  suffixes: Morpheme[];
}

export interface MorphemePart {
  text: string;
  kind: 'prefix' | 'root' | 'base' | 'suffix';
  meaning: string;
  en: string;
}

const data = morphemesData as MorphemeData;

/** 屈折类后缀（-ing/-ed/复数/比较级等）拆错代价高：只有词根对上才认，不走词干兜底 */
const INFLECTION = new Set(['ing', 'ed', 'es', 's', 'est', 'er', 'or']);

interface Flat {
  form: string;
  meaning: string;
  en: string;
}

const flat = (list: Morpheme[]): Flat[] =>
  list
    .flatMap((m) => [m.form, ...(m.forms ?? [])].map((form) => ({ form, meaning: m.meaning, en: m.en })))
    .sort((a, b) => b.form.length - a.form.length);

const PREFIXES = flat(data.prefixes);
const SUFFIXES = flat(data.suffixes);
const ROOTS = flat(data.roots);

/** 词干和词根表对上的几种拼写归一：state→stat、study→studi 不处理，只处理去尾 e 和常见变体 */
function rootOf(stem: string): Flat | undefined {
  const candidates = [stem, stem.replace(/e$/, ''), stem.replace(/ies$/, 'y'), stem.replace(/ied$/, 'y')];
  for (const c of candidates) {
    const hit = ROOTS.find((r) => r.form === c);
    if (hit) return hit;
  }
  return undefined;
}

export interface DecomposeOptions {
  /** 这个词干本身是不是一个认识的词（阅读页传词典的 resolve） */
  isWord?: (stem: string) => boolean;
  /** 词干的中文释义，展示时用 */
  glossOf?: (stem: string) => string | undefined;
}

/**
 * 拆解一个词。成功返回按顺序排列的词素；拆不出可信结果返回 null。
 * 可信的标准：拆完的核心部分要么命中词根表，要么本身是一个词（且拆掉的是派生后缀，不是屈折后缀）。
 */
export function decompose(word: string, opts: DecomposeOptions = {}): MorphemePart[] | null {
  let rest = word.toLowerCase();
  if (!/^[a-z]+$/.test(rest) || rest.length < 4) return null;

  const prefixes: MorphemePart[] = [];
  const suffixes: MorphemePart[] = [];
  let onlyInflection = true;

  for (let i = 0; i < 2; i++) {
    const hit = SUFFIXES.find((s) => rest.endsWith(s.form) && rest.length - s.form.length >= 3);
    if (!hit) break;
    suffixes.unshift({ text: hit.form, kind: 'suffix', meaning: hit.meaning, en: hit.en });
    if (!INFLECTION.has(hit.form)) onlyInflection = false;
    rest = rest.slice(0, -hit.form.length);
    if (hit.form === 'ies' || hit.form === 'ied') rest += 'y';
  }
  for (let i = 0; i < 2; i++) {
    const hit = PREFIXES.find((p) => rest.startsWith(p.form) && rest.length - p.form.length >= 3);
    if (!hit) break;
    prefixes.push({ text: hit.form, kind: 'prefix', meaning: hit.meaning, en: hit.en });
    rest = rest.slice(hit.form.length);
  }
  if (prefixes.length === 0 && suffixes.length === 0) {
    const root = rootOf(rest);
    return root && rest === word.toLowerCase() ? [{ text: rest, kind: 'root', meaning: root.meaning, en: root.en }] : null;
  }
  const root = rootOf(rest);
  if (root) return [...prefixes, { text: rest, kind: 'root', meaning: root.meaning, en: root.en }, ...suffixes];
  if (!onlyInflection && opts.isWord?.(rest)) {
    return [
      ...prefixes,
      { text: rest, kind: 'base', meaning: opts.glossOf?.(rest) ?? '', en: '' },
      ...suffixes,
    ];
  }
  return null;
}

/** 展示用一行：un-（不）+ dict（说）+ -able（能…的） */
export function formatParts(parts: MorphemePart[]): string {
  return parts
    .map((p) => {
      const text = p.kind === 'prefix' ? `${p.text}-` : p.kind === 'suffix' ? `-${p.text}` : p.text;
      return p.meaning ? `${text}（${p.meaning.replace(/（[^）]*）$/, '')}）` : text;
    })
    .join(' + ');
}
