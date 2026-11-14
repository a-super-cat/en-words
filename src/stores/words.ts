import { defineStore } from 'pinia';
import { computed, shallowReactive } from 'vue';
import { db } from '../db';
import type { Rating, WordCardState } from '../types';
import { newWordCard, rateWordCard } from '../vocab/words';

/** 单词线的状态：自己的卡表、自己的计数，和词条那条线互不干扰 */
export const useWords = defineStore('words', () => {
  const cards = shallowReactive(new Map<string, WordCardState>());

  const all = computed(() => [...cards.values()]);

  async function load(): Promise<void> {
    const rows = await db.wordCards.toArray();
    cards.clear();
    for (const r of rows) cards.set(r.word, r);
  }

  /** 给一个词评分。还没有卡就先建卡（新词第一次评分同时完成引入） */
  async function grade(word: string, rating: Rating): Promise<WordCardState> {
    const key = word.toLowerCase();
    const now = Date.now();
    const current = cards.get(key) ?? newWordCard(key, now);
    const next = rateWordCard(current, rating, now);
    await db.wordCards.put({ ...next });
    cards.set(key, next);
    return next;
  }

  async function setSuspended(word: string, suspended: boolean): Promise<void> {
    const key = word.toLowerCase();
    const current = cards.get(key);
    if (!current) return;
    const next = { ...current, suspended };
    await db.wordCards.put(next);
    cards.set(key, next);
  }

  /** 词从生词本移除时连单词卡一起删，免得队列里还留着它 */
  async function removeCard(word: string): Promise<void> {
    const key = word.toLowerCase();
    await db.wordCards.delete(key);
    cards.delete(key);
  }

  /** 把一个词手动加入学习：没卡就建一张今天到期的卡，有卡且暂停中就恢复 */
  async function enqueue(word: string): Promise<void> {
    const key = word.toLowerCase();
    const current = cards.get(key);
    if (current) {
      if (current.suspended) await setSuspended(key, false);
      return;
    }
    const card = newWordCard(key, Date.now());
    await db.wordCards.put({ ...card });
    cards.set(key, card);
  }

  /** 原样写回一张卡，撤销评分时用来恢复评分前的状态 */
  async function upsert(card: WordCardState): Promise<void> {
    const copy = { ...card };
    await db.wordCards.put(copy);
    cards.set(copy.word, copy);
  }

  async function clearHistory(): Promise<void> {
    await db.wordCards.clear();
    await load();
  }

  const exportData = async (): Promise<WordCardState[]> => db.wordCards.toArray();

  /** 用备份整体替换单词卡。旧备份没有这一部分，按空处理 */
  async function importData(data: WordCardState[] | undefined): Promise<void> {
    await db.wordCards.clear();
    if (data && data.length > 0) await db.wordCards.bulkPut(data);
    await load();
  }

  return {
    cards,
    all,
    load,
    grade,
    setSuspended,
    removeCard,
    enqueue,
    upsert,
    clearHistory,
    exportData,
    importData,
  };
});
