import type { WordCardState } from '../types';
import { useApp, type Backup } from './app';
import { useSpeaking, type SpeakingBackup } from './speaking';
import { useVocab, type VocabBackup } from './vocab';
import { useWords } from './words';

/** 备份文件：复习部分，加口语部分（M2）、词汇部分（M3）和单词线（移动端改版第二版）。后几部分在旧备份里没有。 */
export type FullBackup = Backup & {
  speaking?: SpeakingBackup;
  vocab?: VocabBackup;
  words?: WordCardState[];
};

export async function exportBackup(): Promise<FullBackup> {
  const data: FullBackup = {
    ...(await useApp().exportData()),
    speaking: useSpeaking().exportData(),
    vocab: await useVocab().exportData(),
    words: await useWords().exportData(),
  };
  // 备份文件生成出来就算导出，记下时间给今日页的备份提醒用
  await useApp().noteBackupExported();
  return data;
}

/** 返回错误信息；成功时返回 null */
export async function importBackup(data: unknown): Promise<string | null> {
  const error = await useApp().importData(data);
  if (error !== null) return error;
  const backup = data as FullBackup;
  await useSpeaking().importData(backup.speaking);
  await useVocab().importData(backup.vocab);
  await useWords().importData(backup.words);
  return null;
}

/** 清空复习、口语、测评、阅读和单词线的记录，保留词库里自己添加的词条和生词、句子、STAR 故事、设置 */
export async function clearAllProgress(): Promise<void> {
  await useApp().clearProgress();
  await useSpeaking().clearHistory();
  await useVocab().clearHistory();
  await useWords().clearHistory();
}
