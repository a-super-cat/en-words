import type { CardState, Entry, UserNote } from '../types';
import { produceStage } from './schedule';

export type PromptMode = 'cue' | 'sentence' | 'situation' | 'recognize' | 'listen';

export interface Prompt {
  mode: PromptMode;
  /** 写进复习日志的阶梯级别；识别方向记 1 */
  stage: number;
  instruction: string;
  /** 题面。听辨题没有题面，只播放读音 */
  question: string;
  /** 识别题附带的英文例句 */
  context?: string;
  /** 整句和情境题里提示要用上的表达（中文） */
  target?: string;
  answer: string;
  answerZh?: string;
  /** 翻面后朗读的英文 */
  speak: string;
  /** 产出题的作答时限，0 表示不计时 */
  limitSec: number;
}

const LIMIT_SEC = { cue: 5, sentence: 10, situation: 15 } as const;

/** B 层的识别卡每 3 次里有 1 次改成只听读音 */
const LISTEN_EVERY = 3;

export function buildPrompt(card: CardState, entry: Entry, note: UserNote | undefined, canListen: boolean): Prompt {
  const example = entry.examples[0];

  if (card.direction === 'recognize') {
    if (canListen && entry.layer === 'B' && card.reps % LISTEN_EVERY === LISTEN_EVERY - 1) {
      return {
        mode: 'listen',
        stage: 1,
        instruction: '只听读音，回想意思',
        question: '',
        answer: entry.term,
        answerZh: entry.zh,
        speak: entry.term,
        limitSec: 0,
      };
    }
    return {
      mode: 'recognize',
      stage: 1,
      instruction: '回想这个表达的意思',
      question: entry.term,
      context: example?.en,
      answer: entry.zh,
      answerZh: example?.zh,
      speak: entry.term,
      limitSec: 0,
    };
  }

  // 自己写的句子比内置例句更容易在真实场合想起来，所以优先考它
  // 从阅读里收来的生词，例句只有英文原句、没有中文，不能拿来出整句翻译题
  const sentence = note && note.en && note.zh ? note : example?.zh ? example : undefined;
  let stage: number = produceStage(card);
  if (stage === 3 && !entry.situation) stage = 2;
  if (stage === 2 && !sentence) stage = 1;

  if (stage === 3 && entry.situation) {
    return {
      mode: 'situation',
      stage,
      instruction: '用一两句英文回答',
      question: entry.situation.zh,
      target: entry.zh,
      answer: entry.situation.en,
      speak: entry.situation.en,
      limitSec: LIMIT_SEC.situation,
    };
  }
  if (stage === 2 && sentence) {
    return {
      mode: 'sentence',
      stage,
      instruction: '把这句话用英文说出来',
      question: sentence.zh,
      target: entry.zh,
      answer: sentence.en,
      speak: sentence.en,
      limitSec: LIMIT_SEC.sentence,
    };
  }
  return {
    mode: 'cue',
    stage: 1,
    instruction: '用英文说出这个表达',
    question: entry.zh,
    answer: entry.term,
    answerZh: example?.en,
    speak: entry.term,
    limitSec: LIMIT_SEC.cue,
  };
}
