import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { loadSpeaking } from '../content/speaking';
import { db } from '../db';
import { audioToPrune, latestById, pickNext } from '../speaking/pick';
import { startOfDay } from '../srs/queue';
import type { Attempt, ScenarioRun, Story } from '../types';
import { useApp } from './app';

export interface SpeakingBackup {
  /** 备份里不含录音：录音是二进制数据，体积大，也放不进 JSON */
  attempts: Omit<Attempt, 'audio'>[];
  stories: Story[];
  runs: ScenarioRun[];
}

export const useSpeaking = defineStore('speaking', () => {
  const content = loadSpeaking();
  const questionById = new Map(content.questions.map((q) => [q.id, q]));
  const scenarioById = new Map(content.scenarios.map((s) => [s.id, s]));

  const ready = ref(false);
  const attempts = shallowRef<Attempt[]>([]);
  const stories = shallowRef<Story[]>([]);
  const runs = shallowRef<ScenarioRun[]>([]);

  const lastAttemptAt = computed(() => latestById(attempts.value, (a) => a.questionId));
  const lastRunAt = computed(() => latestById(runs.value, (r) => r.scenarioId));

  const today = computed(() => {
    const start = startOfDay(useApp().now);
    return {
      questions: new Set(attempts.value.filter((a) => a.at >= start).map((a) => a.questionId)).size,
      scenarios: new Set(runs.value.filter((r) => r.at >= start).map((r) => r.scenarioId)).size,
    };
  });

  async function load(): Promise<void> {
    const [a, s, r] = await Promise.all([db.attempts.toArray(), db.stories.toArray(), db.runs.toArray()]);
    attempts.value = a.sort((x, y) => x.at - y.at);
    stories.value = s.sort((x, y) => y.updatedAt - x.updatedAt);
    runs.value = r.sort((x, y) => x.at - y.at);
    ready.value = true;
  }

  const within = <T extends { category: string }>(items: T[], category?: string) =>
    category ? items.filter((i) => i.category === category) : items;

  const nextQuestion = (category?: string, exclude?: string) =>
    pickNext(within(content.questions, category), lastAttemptAt.value, exclude);
  const nextScenario = (category?: string, exclude?: string) =>
    pickNext(within(content.scenarios, category), lastRunAt.value, exclude);

  const attemptsOf = (questionId: string) => attempts.value.filter((a) => a.questionId === questionId);

  async function saveAttempt(attempt: Attempt): Promise<void> {
    await db.attempts.put(attempt);
    let all = [...attempts.value, attempt];
    const stale = new Set(audioToPrune(all));
    if (stale.size > 0) {
      all = all.map((a) => (stale.has(a.id) ? { ...a, audio: undefined } : a));
      await db.attempts.bulkPut(all.filter((a) => stale.has(a.id)));
    }
    attempts.value = all;
    useApp().tick();
  }

  async function saveRun(run: ScenarioRun): Promise<void> {
    await db.runs.put(run);
    runs.value = [...runs.value, run];
    useApp().tick();
  }

  async function saveStory(story: Story): Promise<void> {
    await db.stories.put(story);
    stories.value = [story, ...stories.value.filter((s) => s.id !== story.id)];
  }

  async function deleteStory(id: string): Promise<void> {
    await db.stories.delete(id);
    stories.value = stories.value.filter((s) => s.id !== id);
  }

  /** 清空口答和场景的练习记录，保留写好的 STAR 故事 */
  async function clearHistory(): Promise<void> {
    await db.transaction('rw', db.attempts, db.runs, async () => {
      await db.attempts.clear();
      await db.runs.clear();
    });
    await load();
  }

  function exportData(): SpeakingBackup {
    return {
      attempts: attempts.value.map(({ audio: _audio, ...rest }) => rest),
      stories: stories.value,
      runs: runs.value,
    };
  }

  /** 用备份整体替换口语部分的数据。旧版本的备份没有这一部分，按空处理。 */
  async function importData(data: Partial<SpeakingBackup> | undefined): Promise<void> {
    await db.transaction('rw', db.attempts, db.stories, db.runs, async () => {
      await Promise.all([db.attempts.clear(), db.stories.clear(), db.runs.clear()]);
      await db.attempts.bulkPut((data?.attempts ?? []) as Attempt[]);
      await db.stories.bulkPut(data?.stories ?? []);
      await db.runs.bulkPut(data?.runs ?? []);
    });
    await load();
  }

  return {
    ready,
    questions: content.questions,
    questionCategories: content.questionCategories,
    scenarios: content.scenarios,
    scenarioCategories: content.scenarioCategories,
    questionById,
    scenarioById,
    attempts,
    stories,
    runs,
    lastAttemptAt,
    lastRunAt,
    today,
    load,
    nextQuestion,
    nextScenario,
    attemptsOf,
    saveAttempt,
    saveRun,
    saveStory,
    deleteStory,
    clearHistory,
    exportData,
    importData,
  };
});
