export type Layer = 'A' | 'B' | 'C' | 'D';
export type Direction = 'recognize' | 'produce';
export type Rating = 1 | 2 | 3 | 4;
export type Kind = 'word' | 'chunk' | 'sentence';
export type Register = 'formal' | 'neutral' | 'casual';

export interface Pair {
  en: string;
  zh: string;
}

export interface Entry {
  /** `<分类 key>.<slug>`，例如 `c.arch-distributed.single-point-of-failure` */
  id: string;
  term: string;
  kind: Kind;
  layer: Layer;
  /** 分类 key，例如 `c.arch-distributed` */
  category: string;
  /** 中文提示，也是“中译英”题的题面 */
  zh: string;
  ipa?: string;
  examples: Pair[];
  /** 情境题：zh 是情境或提问，en 是参考回答 */
  situation?: Pair;
  collocations?: string[];
  register?: Register;
  note?: string;
  source: 'builtin' | 'user';
  order: number;
}

export interface Category {
  key: string;
  layer: Layer;
  title: string;
}

/** 一条内容在一个方向上的记忆状态。字段含义同 FSRS。 */
export interface CardState {
  /** `<entryId>|<direction>` */
  key: string;
  entryId: string;
  direction: Direction;
  due: number;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: number | null;
  suspended: boolean;
  /** 反复忘记而被自动暂停，等待改写 */
  leech: boolean;
  createdAt: number;
}

export interface ReviewLog {
  id?: number;
  key: string;
  entryId: string;
  direction: Direction;
  rating: Rating;
  at: number;
  ms: number;
  /** 0 表示新学时的首次评分，1–3 是产出阶梯，识别方向记 1 */
  stage: number;
  /** 说得出就算认得：产出评为记得时自动带过的识别卡 */
  auto?: boolean;
}

/** 用户自己写的例句，优先用于整句翻译题 */
export interface UserNote {
  entryId: string;
  en: string;
  zh: string;
}

/** 面试题和场景里提示要用上的表达。term 和词库里的条目同名时会关联到那一条。 */
export interface Chunk {
  term: string;
  zh: string;
}

export interface SpeakingCategory {
  key: string;
  title: string;
}

export interface Question {
  id: string;
  category: string;
  prompt: string;
  zh: string;
  /** 回答提纲，只有要点，不是逐字稿 */
  outline: string[];
  chunks: Chunk[];
  followUps: string[];
}

export interface Turn {
  speaker: 'them' | 'me';
  name?: string;
  /** 对方的原话，或者学习者的参考说法 */
  en: string;
  /** 对方：中文意思。学习者：想表达的意思，看着它开口 */
  zh: string;
  chunks: Chunk[];
}

export interface Scenario {
  id: string;
  category: string;
  title: string;
  setting: string;
  turns: Turn[];
}

/** 一次口答。同一题连答两遍：第 1 遍 120 秒，第 2 遍 90 秒。 */
export interface Attempt {
  id: string;
  questionId: string;
  at: number;
  round: 1 | 2;
  seconds: number;
  limit: number;
  /** 回答里用上的表达（term） */
  used: string[];
  /** 1–5 的流利度自评 */
  fluency: number;
  /** 卡住、没说出来的地方 */
  gaps: string;
  /** 录音只保留最近若干次，更早的会被清掉 */
  audio?: Blob;
}

/** 用 STAR 结构写好的个人经历，行为题时拿来讲 */
export interface Story {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  updatedAt: number;
}

export interface ScenarioRun {
  id: string;
  scenarioId: string;
  at: number;
  /** 自评说出来了的轮数 */
  said: number;
  total: number;
}

/** 一次词汇量测评的结果 */
export interface Assessment {
  id: string;
  at: number;
  /** 每个频段（1000 词一段）抽样里认识的个数 */
  bands: { band: number; known: number; total: number }[];
  /** 估计的词汇量 */
  size: number;
  /** 测评得出的“默认认识前多少个高频词” */
  knownRank: number;
}

/** 手动标记一个词认识还是不认识（小写原形） */
export interface WordMark {
  word: string;
  status: 'known' | 'unknown';
  at: number;
}

/** 一次阅读分析的记录。不保存原文。 */
export interface Reading {
  id: string;
  at: number;
  title: string;
  words: number;
  /** 认识的词占比，0–1 */
  coverage: number;
  /** 当时的生词数（不重复） */
  unknown: number;
  /** 从这篇里加入生词本的词数 */
  added: number;
}

export interface Settings {
  /** 阅读助手默认认识词频排名在这个数以内的词。测评会更新它，也可以手动改。 */
  knownRank: number;
  newPerDay: number;
  reviewMinutes: number;
  maxReviews: number;
  autoSpeak: boolean;
  voice: string;
  rate: number;
  /** 朗读引擎：system = 本机系统语音（离线）；azure = Azure 神经网络语音（联网，自然度高） */
  ttsEngine: 'system' | 'azure';
  /** Azure 语音服务的密钥，只存在本机设置里，绝不进代码仓库 */
  azureKey: string;
  /** Azure 语音服务所在区域，比如 eastus */
  azureRegion: string;
  /** Azure 语音名，比如 en-US-JennyNeural */
  azureVoice: string;
  disabledCategories: string[];
}
