import { defineStore } from 'pinia';
import { computed, shallowReactive, shallowRef } from 'vue';
import { db } from '../db';
import { entryStatus } from '../srs/stats';
import type { Assessment, Reading, WordMark } from '../types';
import type { KnownModel, Mark } from '../vocab/analyze';
import type { DictWord } from '../vocab/dictionary';
import { useApp } from './app';

export interface VocabBackup {
  marks: WordMark[];
  readings: Reading[];
  assessments: Assessment[];
}

export const useVocab = defineStore('vocab', () => {
  const app = useApp();

  const marks = shallowReactive(new Map<string, Mark>());
  const readings = shallowRef<Reading[]>([]);
  const assessments = shallowRef<Assessment[]>([]);

  const latest = computed(() => assessments.value.at(-1));

  /** 词库里的单词（不含词组）按复习状态分成“学习中”和“已掌握” */
  const studied = computed(() => {
    const studying = new Set<string>();
    const mastered = new Set<string>();
    for (const e of app.entries) {
      if (e.kind !== 'word') continue;
      const status = entryStatus(e, app.cards);
      if (status === 'mature') mastered.add(e.term.toLowerCase());
      // 生词本里还没轮到学的词也算“学习中”：已经在队列里了，阅读时不用再当生词提示
      else if (status !== 'new' || e.category.endsWith('.vocab')) studying.add(e.term.toLowerCase());
    }
    return { studying, mastered };
  });

  const model = computed<KnownModel>(() => ({
    knownRank: app.settings.knownRank,
    marks,
    studying: studied.value.studying,
    mastered: studied.value.mastered,
  }));

  /** 生词本里的词：从测评、筛查和阅读里收进来的 */
  const notebook = computed(() => app.entries.filter((e) => e.category.endsWith('.vocab')));

  async function load(): Promise<void> {
    const [m, r, a] = await Promise.all([db.marks.toArray(), db.readings.toArray(), db.assessments.toArray()]);
    marks.clear();
    for (const x of m) marks.set(x.word, x.status);
    readings.value = r.sort((x, y) => x.at - y.at);
    assessments.value = a.sort((x, y) => x.at - y.at);
  }

  async function setMarks(items: { word: string; status: Mark }[]): Promise<void> {
    const at = Date.now();
    const rows = items.map(({ word, status }) => ({ word: word.toLowerCase(), status, at }));
    await db.marks.bulkPut(rows);
    for (const r of rows) marks.set(r.word, r.status);
  }

  const setMark = (word: string, status: Mark) => setMarks([{ word, status }]);

  /** 标成不认识并收进生词本。返回新加入生词本的个数（词库里已有的不重复加）。 */
  async function collect(items: { word: DictWord; sentence?: string }[]): Promise<number> {
    await setMarks(items.map((i) => ({ word: i.word.word, status: 'unknown' as const })));
    return app.addVocabWords(items);
  }

  async function saveAssessment(a: Assessment): Promise<void> {
    await db.assessments.put(a);
    assessments.value = [...assessments.value, a];
    await app.updateSettings({ knownRank: a.knownRank });
  }

  async function saveReading(r: Reading): Promise<void> {
    await db.readings.put(r);
    readings.value = [...readings.value.filter((x) => x.id !== r.id), r].sort((x, y) => x.at - y.at);
  }

  async function deleteReading(id: string): Promise<void> {
    await db.readings.delete(id);
    readings.value = readings.value.filter((r) => r.id !== id);
  }

  const tables = [db.marks, db.readings, db.assessments];

  /** 清空测评、阅读记录和认识/不认识的标记。生词本里的词条属于词库，不在这里清。 */
  async function clearHistory(): Promise<void> {
    await db.transaction('rw', tables, () => Promise.all(tables.map((t) => t.clear())));
    await load();
  }

  const exportData = async (): Promise<VocabBackup> => ({
    marks: await db.marks.toArray(),
    readings: readings.value,
    assessments: assessments.value,
  });

  /** 用备份整体替换词汇部分的数据。旧版本的备份没有这一部分，按空处理。 */
  async function importData(data: Partial<VocabBackup> | undefined): Promise<void> {
    await db.transaction('rw', tables, async () => {
      await Promise.all(tables.map((t) => t.clear()));
      await db.marks.bulkPut(data?.marks ?? []);
      await db.readings.bulkPut(data?.readings ?? []);
      await db.assessments.bulkPut(data?.assessments ?? []);
    });
    await load();
  }

  return {
    marks,
    readings,
    assessments,
    latest,
    model,
    notebook,
    load,
    setMark,
    setMarks,
    collect,
    saveAssessment,
    saveReading,
    deleteReading,
    clearHistory,
    exportData,
    importData,
  };
});
