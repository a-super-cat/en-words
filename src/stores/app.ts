import { defineStore } from 'pinia';
import { computed, reactive, ref, shallowReactive, shallowRef, toRaw } from 'vue';
import { loadBuiltin } from '../content/builtin';
import { slug } from '../content/slug';
import { db } from '../db';
import { parseCsv } from '../lib/csv';
import { buildReviewQueue, dayKey, isDue, pickNewGroups, startOfDay } from '../srs/queue';
import { cardKey, newCard, rateCard } from '../srs/schedule';
import { progressByCategory, streakDays } from '../srs/stats';
import type { CardState, Category, Chunk, Entry, Layer, Rating, ReviewLog, Settings, UserNote } from '../types';
import type { DictWord } from '../vocab/dictionary';

export type LearnOutcome = 'known' | 'pass' | 'retry';

export interface UndoToken {
  prev: CardState[];
  logIds: number[];
  ms: number;
  /** 被“说得出就算认得”自动带过的识别卡 */
  autoKeys: string[];
  /** 这次评分让条目变成了顽固条目并被暂停 */
  becameLeech: boolean;
}

export interface NewEntryInput {
  term: string;
  zh: string;
  en: string;
  exampleZh: string;
  layer: Layer;
}

export interface Backup {
  app: 'en-words';
  version: 1;
  exportedAt: string;
  cards: CardState[];
  logs: ReviewLog[];
  userEntries: Entry[];
  notes: UserNote[];
  settings: Settings;
}

const LAYERS: Layer[] = ['A', 'B', 'C', 'D'];
const MINE_TITLE = '我的词条';
const VOCAB_TITLE = '生词本';
/** A 层和 D 层的分界：词频排名在这个数以内的是通用核心词，要练到说得出；之外的书面词只练认读 */
const CORE_RANK = 3000;

const DEFAULTS: Settings = {
  knownRank: CORE_RANK,
  newPerDay: 20,
  reviewMinutes: 25,
  maxReviews: 120,
  autoSpeak: true,
  voice: '',
  rate: 1,
  ttsEngine: 'system',
  azureKey: '',
  azureRegion: 'eastus',
  azureVoice: 'en-US-JennyNeural',
  disabledCategories: [],
};
/** 单张卡计入学习时长的上限，避免中途离开把时长撑大 */
const MAX_CARD_MS = 60_000;

export const useApp = defineStore('app', () => {
  const builtin = loadBuiltin();

  const ready = ref(false);
  const error = ref('');
  const now = ref(Date.now());

  const userEntries = shallowRef<Entry[]>([]);
  // 卡片和笔记用浅响应：存进去的是普通对象，可以直接交给 IndexedDB；更新时整体替换。
  const cards = shallowReactive(new Map<string, CardState>());
  const notes = shallowReactive(new Map<string, UserNote>());
  const days = shallowReactive(new Set<string>());
  const settings = reactive<Settings>({ ...DEFAULTS });
  const todayStats = reactive({ reviews: 0, ms: 0 });

  const entries = computed(() => [...builtin.entries, ...userEntries.value]);
  const byId = computed(() => new Map(entries.value.map((e) => [e.id, e])));
  const categories = computed<Category[]>(() => {
    // 自己加的内容有两种分类：手动添加的词条，和从测评、阅读里收进来的生词
    const own = new Map<string, Category>();
    for (const e of userEntries.value) {
      if (own.has(e.category)) continue;
      own.set(e.category, {
        key: e.category,
        layer: e.layer,
        title: e.category.endsWith('.vocab') ? VOCAB_TITLE : MINE_TITLE,
      });
    }
    return [...builtin.categories, ...[...own.values()].sort((a, b) => a.key.localeCompare(b.key))];
  });
  const categoryTitle = computed(() => new Map(categories.value.map((c) => [c.key, c.title])));
  const byTerm = computed(() => new Map(entries.value.map((e) => [e.term.toLowerCase(), e])));

  const hasCard = (entryId: string) =>
    cards.has(cardKey(entryId, 'recognize')) || cards.has(cardKey(entryId, 'produce'));

  /** 只统计词库里还存在的条目；内容被删掉后，遗留的卡片不再出题 */
  const liveCards = computed(() => [...cards.values()].filter((c) => byId.value.has(c.entryId)));
  const dueCount = computed(() => {
    const due = liveCards.value.filter((c) => isDue(c, now.value));
    const produce = due.filter((c) => c.direction === 'produce').length;
    return { produce, recognize: due.length - produce, total: due.length };
  });
  const learnedToday = computed(() => {
    const start = startOfDay(now.value);
    return new Set(liveCards.value.filter((c) => c.createdAt >= start).map((c) => c.entryId)).size;
  });
  const unseenCount = computed(() => {
    const disabled = new Set(settings.disabledCategories);
    return entries.value.filter((e) => !disabled.has(e.category) && !hasCard(e.id)).length;
  });
  const newRemaining = computed(() =>
    Math.min(unseenCount.value, Math.max(0, settings.newPerDay - learnedToday.value)),
  );
  const progress = computed(() => progressByCategory(entries.value, cards));
  const streak = computed(() => streakDays(days, now.value));

  const plainSettings = (): Settings => ({
    ...toRaw(settings),
    disabledCategories: [...settings.disabledCategories],
  });

  async function init(): Promise<void> {
    try {
      const [cardRows, noteRows, userRows, saved, logs] = await Promise.all([
        db.cards.toArray(),
        db.notes.toArray(),
        db.userEntries.toArray(),
        db.kv.get('settings'),
        db.logs.toArray(),
      ]);
      cards.clear();
      for (const c of cardRows) cards.set(c.key, c);
      notes.clear();
      for (const n of noteRows) notes.set(n.entryId, n);
      userEntries.value = userRows.sort((a, b) => a.order - b.order);
      Object.assign(settings, DEFAULTS, (saved?.value as Partial<Settings> | undefined) ?? {});

      const start = startOfDay(Date.now());
      days.clear();
      todayStats.reviews = 0;
      todayStats.ms = 0;
      for (const log of logs) {
        days.add(dayKey(log.at));
        if (log.at >= start && log.stage > 0 && !log.auto) {
          todayStats.reviews++;
          todayStats.ms += Math.min(log.ms, MAX_CARD_MS);
        }
      }
      now.value = Date.now();
      ready.value = true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  // 页面开着跨过午夜时，今天的统计和连续天数要按新的一天重算，不然得刷新才对
  let lastTickDay = dayKey(Date.now());
  const tick = () => {
    now.value = Date.now();
    const today = dayKey(now.value);
    if (today !== lastTickDay) {
      lastTickDay = today;
      void init();
    }
  };

  /** 某个时刻之后的复习日志，统计页用 */
  const logsSince = (time: number) => db.logs.where('at').aboveOrEqual(time).toArray();

  function reviewQueue(): string[] {
    tick();
    return buildReviewQueue(liveCards.value, now.value, settings.maxReviews).map((c) => c.key);
  }

  function pickNew(count: number): Entry[][] {
    return pickNewGroups(entries.value, hasCard, new Set(settings.disabledCategories), count);
  }

  async function commit(changed: CardState[], logs: ReviewLog[]): Promise<number[]> {
    const ids = await db.transaction('rw', db.cards, db.logs, async () => {
      await db.cards.bulkPut(changed);
      return db.logs.bulkAdd(logs, { allKeys: true });
    });
    for (const c of changed) cards.set(c.key, c);
    if (logs.length > 0) days.add(dayKey(logs[0].at));
    tick();
    return ids;
  }

  /**
   * 一组新内容学完后建卡。known：自称已经会了；pass：小测一次说对；retry：小测说错过。
   * groupMs 是这一组从开始到学完的总用时，均摊写进每条新学日志的 ms，统计页按总和算时长。
   */
  async function learnGroup(results: { entry: Entry; outcome: LearnOutcome }[], groupMs = 0): Promise<void> {
    const t = Date.now();
    const changed: CardState[] = [];
    const pending: { entry: Entry; direction: 'recognize' | 'produce'; rating: Rating }[] = [];
    for (const { entry, outcome } of results) {
      if (hasCard(entry.id)) continue;
      pending.push({ entry, direction: 'recognize', rating: outcome === 'known' ? 4 : 3 });
      // D 层是只需要读懂的书面词，不练产出
      if (entry.layer !== 'D') {
        pending.push({ entry, direction: 'produce', rating: outcome === 'known' ? 4 : outcome === 'pass' ? 3 : 1 });
      }
    }
    const perLogMs = pending.length > 0 ? Math.round(groupMs / pending.length) : 0;
    const logs: ReviewLog[] = pending.map(({ entry, direction, rating }) => {
      const card = rateCard(newCard(entry.id, direction, t), rating, t);
      changed.push(card);
      return { key: card.key, entryId: entry.id, direction, rating, at: t, ms: perLogMs, stage: 0 };
    });
    await commit(changed, logs);
  }

  async function rate(key: string, rating: Rating, ms: number, stage: number): Promise<UndoToken | null> {
    const card = cards.get(key);
    if (!card) return null;
    const t = Date.now();
    const next = rateCard(card, rating, t);
    const prev = [card];
    const changed = [next];
    const logs: ReviewLog[] = [
      { key, entryId: card.entryId, direction: card.direction, rating, at: t, ms, stage },
    ];
    const autoKeys: string[] = [];

    // 说得出就一定认得：产出评为“记得”以上时，今天到期的识别卡直接按“记得”带过，不再单独出题
    if (card.direction === 'produce' && rating >= 3) {
      const sibling = cards.get(cardKey(card.entryId, 'recognize'));
      if (sibling && isDue(sibling, t)) {
        prev.push(sibling);
        changed.push(rateCard(sibling, 3, t));
        logs.push({
          key: sibling.key,
          entryId: card.entryId,
          direction: 'recognize',
          rating: 3,
          at: t,
          ms: 0,
          stage: 1,
          auto: true,
        });
        autoKeys.push(sibling.key);
      }
    }

    const logIds = await commit(changed, logs);
    const counted = Math.min(ms, MAX_CARD_MS);
    todayStats.reviews++;
    todayStats.ms += counted;
    return { prev, logIds, ms: counted, autoKeys, becameLeech: next.leech && !card.leech };
  }

  async function undo(token: UndoToken): Promise<void> {
    await db.transaction('rw', db.cards, db.logs, async () => {
      await db.cards.bulkPut(token.prev);
      await db.logs.bulkDelete(token.logIds);
    });
    for (const c of token.prev) cards.set(c.key, c);
    todayStats.reviews = Math.max(0, todayStats.reviews - 1);
    todayStats.ms = Math.max(0, todayStats.ms - token.ms);
    tick();
  }

  const entryCards = (entryId: string) =>
    (['recognize', 'produce'] as const).map((d) => cards.get(cardKey(entryId, d))).filter((c) => c !== undefined);

  async function setSuspended(entryId: string, suspended: boolean): Promise<void> {
    const changed = entryCards(entryId).map((c) => ({ ...c, suspended, leech: suspended ? c.leech : false }));
    await db.cards.bulkPut(changed);
    for (const c of changed) cards.set(c.key, c);
  }

  /** 清掉一条内容的学习记录，让它回到“未学” */
  async function resetEntry(entryId: string): Promise<void> {
    const keys = entryCards(entryId).map((c) => c.key);
    await db.cards.bulkDelete(keys);
    for (const k of keys) cards.delete(k);
  }

  async function saveNote(entryId: string, en: string, zh: string): Promise<void> {
    const note = { entryId, en: en.trim(), zh: zh.trim() };
    if (!note.en && !note.zh) {
      await db.notes.delete(entryId);
      notes.delete(entryId);
    } else {
      await db.notes.put(note);
      notes.set(entryId, note);
    }
  }

  function buildUserEntry(input: NewEntryInput, order: number): Entry | string {
    const term = input.term.trim();
    const zh = input.zh.trim();
    const en = input.en.trim();
    const exampleZh = input.exampleZh.trim();
    if (!term || !zh) return '英文和中文提示都要填';
    if (slug(term) === '') return '英文里至少要有一个字母或数字';
    if ((en === '') !== (exampleZh === '')) return '例句的英文和中文要么都填，要么都不填';
    const category = `${input.layer.toLowerCase()}.mine`;
    return {
      id: `${category}.${slug(term)}`,
      term,
      kind: /\s/.test(term) ? 'chunk' : 'word',
      layer: input.layer,
      category,
      zh,
      examples: en ? [{ en, zh: exampleZh }] : [],
      source: 'user',
      order,
    };
  }

  const termExists = (term: string, extra: Entry[] = []) => {
    const key = term.toLowerCase();
    return [...entries.value, ...extra].some((e) => e.term.toLowerCase() === key);
  };

  /** 返回错误信息；成功时返回 null */
  async function addUserEntry(input: NewEntryInput): Promise<string | null> {
    const entry = buildUserEntry(input, Date.now());
    if (typeof entry === 'string') return entry;
    if (termExists(entry.term)) return '词库里已经有这一条';
    await db.userEntries.put(entry);
    userEntries.value = [...userEntries.value, entry];
    return null;
  }

  async function deleteUserEntry(entryId: string): Promise<void> {
    await resetEntry(entryId);
    await db.notes.delete(entryId);
    notes.delete(entryId);
    await db.userEntries.delete(entryId);
    userEntries.value = userEntries.value.filter((e) => e.id !== entryId);
  }

  /** CSV 列：英文, 中文提示, 例句英文, 例句中文, 层（A/B/C/D，可省略，默认 C）。第一行是表头时自动跳过。 */
  async function importCsv(text: string): Promise<{ added: number; skipped: number }> {
    const rows = parseCsv(text);
    if (rows.length > 0 && /^(term|英文)$/i.test(rows[0][0])) rows.shift();
    const added: Entry[] = [];
    let skipped = 0;
    const base = Date.now();
    for (const [term = '', zh = '', en = '', exampleZh = '', layerCell = ''] of rows) {
      const layer = LAYERS.find((l) => l === layerCell.toUpperCase()) ?? 'C';
      const entry = buildUserEntry({ term, zh, en, exampleZh, layer }, base + added.length);
      if (typeof entry === 'string' || termExists(entry.term, added)) skipped++;
      else added.push(entry);
    }
    await db.userEntries.bulkPut(added);
    userEntries.value = [...userEntries.value, ...added];
    return { added: added.length, skipped };
  }

  /**
   * 把词典里的词收进生词本，之后和其他新内容一样按组学习。高频词归 A 层（要练到说得出），其余归 D 层（只练认读）。
   * 带上原句的话，原句会作为例句。词库里已经有的词会跳过。返回实际加入的个数。
   */
  async function addVocabWords(items: { word: DictWord; sentence?: string }[]): Promise<number> {
    const added: Entry[] = [];
    const base = Date.now();
    for (const { word, sentence } of items) {
      if (slug(word.word) === '' || termExists(word.word, added)) continue;
      const layer: Layer = word.rank !== null && word.rank <= CORE_RANK ? 'A' : 'D';
      const category = `${layer.toLowerCase()}.vocab`;
      added.push({
        id: `${category}.${slug(word.word)}`,
        term: word.word,
        kind: 'word',
        layer,
        category,
        zh: word.zh,
        ipa: word.phonetic ? `/${word.phonetic}/` : undefined,
        examples: sentence ? [{ en: sentence, zh: '' }] : [],
        source: 'user',
        order: base + added.length,
      });
    }
    if (added.length > 0) {
      await db.userEntries.bulkPut(added);
      userEntries.value = [...userEntries.value, ...added];
    }
    return added.length;
  }

  /** 面试题和场景里的表达在词库里的状态：已在复习、词库里有但没学、词库里没有 */
  function chunkStatus(chunk: Chunk): 'reviewing' | 'library' | 'none' {
    const entry = byTerm.value.get(chunk.term.trim().toLowerCase());
    if (!entry) return 'none';
    return hasCard(entry.id) ? 'reviewing' : 'library';
  }

  /**
   * 把一个表达加入复习：词库里有就直接用那一条，没有就先建成自己的词条。
   * 按“小测说错过”建卡，明天开始出题。返回错误信息；成功时返回 null。
   */
  async function addChunk(chunk: Chunk, layer: Layer): Promise<string | null> {
    let entry = byTerm.value.get(chunk.term.trim().toLowerCase());
    if (!entry) {
      const built = buildUserEntry({ term: chunk.term, zh: chunk.zh, en: '', exampleZh: '', layer }, Date.now());
      if (typeof built === 'string') return built;
      await db.userEntries.put(built);
      userEntries.value = [...userEntries.value, built];
      entry = built;
    }
    if (!hasCard(entry.id)) await learnGroup([{ entry, outcome: 'retry' }]);
    return null;
  }

  async function updateSettings(patch: Partial<Settings>): Promise<void> {
    Object.assign(settings, patch);
    await db.kv.put({ key: 'settings', value: plainSettings() });
  }

  async function exportData(): Promise<Backup> {
    const [cardRows, logs, entryRows, noteRows] = await Promise.all([
      db.cards.toArray(),
      db.logs.toArray(),
      db.userEntries.toArray(),
      db.notes.toArray(),
    ]);
    return {
      app: 'en-words',
      version: 1,
      exportedAt: new Date().toISOString(),
      cards: cardRows,
      logs,
      userEntries: entryRows,
      notes: noteRows,
      settings: plainSettings(),
    };
  }

  const tables = [db.cards, db.logs, db.userEntries, db.notes, db.kv];

  /** 用备份整体替换当前数据。返回错误信息；成功时返回 null */
  async function importData(data: unknown): Promise<string | null> {
    const b = data as Partial<Backup> | null;
    if (!b || b.app !== 'en-words' || b.version !== 1) return '这不是 en-words 的备份文件';
    if (![b.cards, b.logs, b.userEntries, b.notes].every(Array.isArray)) return '备份文件不完整';
    await db.transaction('rw', tables, async () => {
      await Promise.all(tables.map((t) => t.clear()));
      await db.cards.bulkPut(b.cards!);
      await db.logs.bulkPut(b.logs!);
      await db.userEntries.bulkPut(b.userEntries!);
      await db.notes.bulkPut(b.notes!);
      await db.kv.put({ key: 'settings', value: { ...DEFAULTS, ...b.settings } });
    });
    await init();
    return null;
  }

  /** 清空学习记录，保留自己添加的词条、例句和设置 */
  async function clearProgress(): Promise<void> {
    await db.transaction('rw', db.cards, db.logs, async () => {
      await db.cards.clear();
      await db.logs.clear();
    });
    await init();
  }

  return {
    ready,
    error,
    now,
    entries,
    byId,
    byTerm,
    categories,
    categoryTitle,
    cards,
    notes,
    settings,
    todayStats,
    dueCount,
    learnedToday,
    unseenCount,
    newRemaining,
    progress,
    streak,
    init,
    tick,
    logsSince,
    reviewQueue,
    pickNew,
    learnGroup,
    rate,
    undo,
    setSuspended,
    resetEntry,
    saveNote,
    addUserEntry,
    deleteUserEntry,
    importCsv,
    addVocabWords,
    chunkStatus,
    addChunk,
    updateSettings,
    exportData,
    importData,
    clearProgress,
  };
});
