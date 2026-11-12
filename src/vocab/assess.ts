import { shuffle } from '../srs/queue';
import type { DictWord } from './dictionary';

/** 每个频段 1000 个词 */
export const BAND_SIZE = 1000;
/** 测评最多测到第几个频段 */
export const MAX_BANDS = 15;
/** 每个频段抽几个词 */
export const PER_BAND = 10;
/** 一个频段里认识的比例达到这个数，才算“这一段基本都认识” */
const SOLID = 0.8;
/** 连续两个频段认识的比例不超过这个数就提前结束，后面的不用测了 */
const GIVE_UP = 0.2;

export interface BandResult {
  /** 从 1 开始 */
  band: number;
  known: number;
  total: number;
}

export const bandOf = (rank: number) => Math.ceil(rank / BAND_SIZE);
export const bandRange = (band: number): [number, number] => [(band - 1) * BAND_SIZE + 1, band * BAND_SIZE];

export function bandWords(ranked: DictWord[], band: number): DictWord[] {
  const [from, to] = bandRange(band);
  return ranked.slice(from - 1, to);
}

/** 从一个频段里随机抽词。太短的词多是缩写，不拿来测。 */
export function sampleBand(ranked: DictWord[], band: number, n = PER_BAND, rand: () => number = Math.random): DictWord[] {
  return shuffle(
    bandWords(ranked, band).filter((w) => w.word.length >= 3),
    rand,
  ).slice(0, n);
}

export function shouldStop(results: BandResult[]): boolean {
  if (results.length >= MAX_BANDS) return true;
  const tail = results.slice(-2);
  return tail.length === 2 && tail.every((r) => r.known / r.total <= GIVE_UP);
}

export interface Estimate {
  /** 估计的词汇量：各频段认识的比例乘以频段大小，再求和 */
  size: number;
  /** 从最高频开始，连续“基本都认识”的频段覆盖到的排名。阅读助手默认认识这个排名以内的词。 */
  knownRank: number;
}

export function estimate(results: BandResult[]): Estimate {
  const size = Math.round(results.reduce((sum, r) => sum + (r.known / r.total) * BAND_SIZE, 0) / 100) * 100;
  let solid = 0;
  while (solid < results.length && results[solid].known / results[solid].total >= SOLID) solid++;
  // 最高频的 1000 词即使抽样里错了几个，也当作认识：否则阅读助手会把最基础的词全标成生词
  return { size, knownRank: Math.max(1, solid) * BAND_SIZE };
}
