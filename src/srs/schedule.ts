import { fsrs, State, type Card, type Grade } from 'ts-fsrs';
import type { CardState, Direction, Rating } from '../types';

export const DAY = 86_400_000;

/** 累计忘记这么多次就自动暂停，提示改写 */
export const LEECH_LAPSES = 4;

/** 产出阶梯的分界（记忆稳定度，单位天）：低于第一个值考提示回忆，低于第二个值考整句翻译，其余考情境应答 */
export const STAGE_DAYS = [4, 15] as const;

// 每天只打开一次的工具不适合分钟级的学习步骤，所以关掉 short term：
// 新卡第一次评分后直接进入按天计的复习。
const engine = fsrs({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: true,
  enable_short_term: false,
});

export const cardKey = (entryId: string, direction: Direction) => `${entryId}|${direction}`;

export function newCard(entryId: string, direction: Direction, now: number): CardState {
  return {
    key: cardKey(entryId, direction),
    entryId,
    direction,
    due: now,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    state: State.New,
    lastReview: null,
    suspended: false,
    leech: false,
    createdAt: now,
  };
}

function toFsrs(card: CardState): Card {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as State,
    last_review: card.lastReview === null ? undefined : new Date(card.lastReview),
  };
}

export function rateCard(card: CardState, rating: Rating, now: number): CardState {
  const next = engine.next(toFsrs(card), new Date(now), rating as Grade).card;
  const becameLeech = next.lapses > card.lapses && next.lapses % LEECH_LAPSES === 0;
  return {
    ...card,
    due: next.due.getTime(),
    stability: next.stability,
    difficulty: next.difficulty,
    scheduledDays: next.scheduled_days,
    learningSteps: next.learning_steps,
    reps: next.reps,
    lapses: next.lapses,
    state: next.state,
    lastReview: now,
    suspended: card.suspended || becameLeech,
    leech: card.leech || becameLeech,
  };
}

/** 四个评分各自会把下次复习排到几天后 */
export function previewDays(card: CardState, now: number): Record<Rating, number> {
  const preview = engine.repeat(toFsrs(card), new Date(now));
  const days = (rating: Rating) =>
    Math.max(1, Math.round((preview[rating as Grade].card.due.getTime() - now) / DAY));
  return { 1: days(1), 2: days(2), 3: days(3), 4: days(4) };
}

export function produceStage(card: CardState): 1 | 2 | 3 {
  if (card.stability < STAGE_DAYS[0]) return 1;
  if (card.stability < STAGE_DAYS[1]) return 2;
  return 3;
}
