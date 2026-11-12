// 单词详解二期的人工内容（词源小注、常用搭配、场景例句）。
// 数据在 content/wordlists/word-notes.json，人工撰写、先覆盖高频技术词；查不到就返回 undefined，界面不显示。
import notesData from '../../content/wordlists/word-notes.json';

export interface WordNote {
  /** 词源小注，中英对照，简明版 */
  etymology: string;
  /** 常用搭配，每条是“英文搭配 中文” */
  collocations: string[];
  /** 场景例句：职场语境的一句英文 + 中文 */
  example: { en: string; zh: string };
}

const notes = notesData as Record<string, WordNote | string>;

export function getWordNote(word: string): WordNote | undefined {
  const hit = notes[word.toLowerCase()];
  return typeof hit === 'object' ? hit : undefined;
}
