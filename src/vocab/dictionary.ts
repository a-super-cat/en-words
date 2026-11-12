/** 词频词典里的一个词。数据由 scripts/build-wordlist.mjs 从 ECDICT 生成。 */
export interface DictWord {
  word: string;
  zh: string;
  phonetic: string;
  /** 词频排名，从 1 开始。补充的低频词没有排名。 */
  rank: number | null;
  /** 带计算机义项的补充词。工程师一般都认识，默认算认识。 */
  tech: boolean;
}

/** [单词, 中文释义, 音标, 变形, 是否技术词] */
type RawWord = [string, string, string, string, number?];

export interface RawDictionary {
  words: RawWord[];
  extra: RawWord[];
}

export interface Dictionary {
  /** 按词频排序的通用词，下标 + 1 就是排名 */
  ranked: DictWord[];
  size: number;
  /** 把文中出现的词还原成词典里的原形；词典里没有就返回 undefined */
  resolve(token: string): DictWord | undefined;
}

const CONTRACTION = /['’](s|re|ve|ll|d|m)$|n['’]t$/;

/** 词典查不到变形时，按常见的词尾规则猜原形。返回的候选要再去词典里确认。 */
export function guessLemmas(word: string): string[] {
  const out: string[] = [];
  const cut = (suffix: string, ...endings: string[]) => {
    if (!word.endsWith(suffix) || word.length - suffix.length < 2) return;
    const stem = word.slice(0, -suffix.length);
    for (const e of endings) out.push(stem + e);
    // stopped → stop，running → run
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) out.push(stem.slice(0, -1));
  };
  cut('ies', 'y');
  cut('ied', 'y');
  cut('es', '', 'e');
  cut('s', '');
  cut('ed', '', 'e');
  cut('ing', '', 'e');
  cut('er', '', 'e');
  cut('est', '', 'e');
  cut('ly', '');
  return out;
}

export function buildDictionary(raw: RawDictionary): Dictionary {
  const byWord = new Map<string, DictWord>();
  const lemmaOf = new Map<string, DictWord>();

  const add = ([word, zh, phonetic, forms, tech]: RawWord, rank: number | null) => {
    const entry: DictWord = { word, zh, phonetic, rank, tech: tech === 1 };
    const key = word.toLowerCase();
    if (!byWord.has(key)) byWord.set(key, entry);
    // 一个变形可能属于多个词（left 既是 leave 的过去式，也可能是别的词的变形），保留词频更高的那个
    for (const form of forms ? forms.split(' ') : []) if (!lemmaOf.has(form)) lemmaOf.set(form, entry);
    return entry;
  };
  const ranked = raw.words.map((w, i) => add(w, i + 1));
  for (const w of raw.extra) add(w, null);

  // 有的词既是词条又是别的词的变形：are 是 be 的变形，也是一个罕见的名词（公亩）。取词频更高的那个解释。
  const lookup = (key: string): DictWord | undefined => {
    const own = byWord.get(key);
    const lemma = lemmaOf.get(key);
    if (own && lemma) return (lemma.rank ?? Infinity) < (own.rank ?? Infinity) ? lemma : own;
    return own ?? lemma;
  };

  function resolve(token: string): DictWord | undefined {
    let key = token.toLowerCase().replace(/’/g, "'");
    const direct = lookup(key);
    if (direct) return direct;
    // don't → do，it's → it，we're → we
    if (CONTRACTION.test(key)) key = key.replace(/n't$/, '').replace(/'(s|re|ve|ll|d|m)$/, '');
    key = key.replace(/'/g, '');
    const plain = lookup(key);
    if (plain) return plain;
    for (const guess of guessLemmas(key)) {
      const hit = byWord.get(guess);
      if (hit) return hit;
    }
    return undefined;
  }

  return { ranked, size: ranked.length, resolve };
}

let cached: Promise<Dictionary> | undefined;

/** 词典有 2 MB 多，只在用到的页面按需加载，加载一次后复用。 */
export function loadDictionary(): Promise<Dictionary> {
  if (!cached) {
    // 用 glob 而不是直接 import：这样 TypeScript 不会去解析这个大 JSON 文件来推断类型
    const loaders = import.meta.glob<RawDictionary>('../../content/wordlists/frequency.json', { import: 'default' });
    cached = Object.values(loaders)[0]().then(buildDictionary);
  }
  return cached;
}
