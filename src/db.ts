import Dexie, { type Table } from 'dexie';
import type {
  Assessment,
  Attempt,
  CardState,
  Entry,
  Reading,
  ReviewLog,
  ScenarioRun,
  Story,
  UserNote,
  WordMark,
} from './types';

class AppDB extends Dexie {
  cards!: Table<CardState, string>;
  logs!: Table<ReviewLog, number>;
  userEntries!: Table<Entry, string>;
  notes!: Table<UserNote, string>;
  kv!: Table<{ key: string; value: unknown }, string>;
  attempts!: Table<Attempt, string>;
  stories!: Table<Story, string>;
  runs!: Table<ScenarioRun, string>;
  marks!: Table<WordMark, string>;
  readings!: Table<Reading, string>;
  assessments!: Table<Assessment, string>;

  constructor() {
    super('en-words');
    this.version(1).stores({
      cards: 'key, entryId, due',
      logs: '++id, at, key',
      userEntries: 'id',
      notes: 'entryId',
      kv: 'key',
    });
    // M2：口答记录、STAR 故事、场景练习记录
    this.version(2).stores({
      attempts: 'id, questionId, at',
      stories: 'id',
      runs: 'id, scenarioId, at',
    });
    // M3：单词的认识/不认识标记、阅读记录、词汇量测评记录
    this.version(3).stores({
      marks: 'word',
      readings: 'id, at',
      assessments: 'id, at',
    });
  }
}

export const db = new AppDB();
