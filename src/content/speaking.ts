import type { Chunk, Question, Scenario, SpeakingCategory, Turn } from '../types';

export interface RawQuestionFile {
  category: string;
  title: string;
  questions: {
    id: string;
    prompt: string;
    zh: string;
    outline: string[];
    chunks: Chunk[];
    followUps?: string[];
  }[];
}

export interface RawScenarioFile {
  category: string;
  title: string;
  scenarios: {
    id: string;
    title: string;
    setting: string;
    turns: (Omit<Turn, 'chunks'> & { chunks?: Chunk[] })[];
  }[];
}

// 分类的展示顺序。文件名的字母顺序不适合学习（比如“反问面试官”应该在最后），没列在这里的分类排在最后。
const QUESTION_ORDER = ['intro', 'behavioral', 'leadership', 'system-design', 'architecture', 'frontend', 'backend', 'data', 'reverse'];
const SCENARIO_ORDER = ['interview', 'standup', 'requirements', 'design-review', 'code-review', 'incident', 'one-on-one', 'onboarding', 'small-talk'];

function ordered<F extends { category: string }>(files: Record<string, F>, order: string[]): F[] {
  const rank = (f: F) => (order.includes(f.category) ? order.indexOf(f.category) : order.length);
  return Object.keys(files)
    .sort()
    .map((path) => files[path])
    .sort((a, b) => rank(a) - rank(b));
}

export function normalizeQuestions(files: Record<string, RawQuestionFile>) {
  const categories: SpeakingCategory[] = [];
  const questions: Question[] = [];
  const seen = new Set<string>();
  for (const file of ordered(files, QUESTION_ORDER)) {
    categories.push({ key: file.category, title: file.title });
    for (const q of file.questions) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      questions.push({ ...q, category: file.category, followUps: q.followUps ?? [] });
    }
  }
  return { categories, questions };
}

export function normalizeScenarios(files: Record<string, RawScenarioFile>) {
  const categories: SpeakingCategory[] = [];
  const scenarios: Scenario[] = [];
  const seen = new Set<string>();
  for (const file of ordered(files, SCENARIO_ORDER)) {
    categories.push({ key: file.category, title: file.title });
    for (const s of file.scenarios) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      scenarios.push({
        ...s,
        category: file.category,
        turns: s.turns.map((t) => ({ ...t, chunks: t.chunks ?? [] })),
      });
    }
  }
  return { categories, scenarios };
}

export function loadSpeaking() {
  const q = normalizeQuestions(
    import.meta.glob<RawQuestionFile>('../../content/questions/*.json', { eager: true, import: 'default' }),
  );
  const s = normalizeScenarios(
    import.meta.glob<RawScenarioFile>('../../content/scenarios/*.json', { eager: true, import: 'default' }),
  );
  return {
    questions: q.questions,
    questionCategories: q.categories,
    scenarios: s.scenarios,
    scenarioCategories: s.categories,
  };
}
