import { useApp, type Backup } from './app';
import { useSpeaking, type SpeakingBackup } from './speaking';
import { useVocab, type VocabBackup } from './vocab';

/** 备份文件：复习部分，加口语部分（M2）和词汇部分（M3）。后两部分在旧备份里没有。 */
export type FullBackup = Backup & { speaking?: SpeakingBackup; vocab?: VocabBackup };

export async function exportBackup(): Promise<FullBackup> {
  return {
    ...(await useApp().exportData()),
    speaking: useSpeaking().exportData(),
    vocab: await useVocab().exportData(),
  };
}

/** 返回错误信息；成功时返回 null */
export async function importBackup(data: unknown): Promise<string | null> {
  const error = await useApp().importData(data);
  if (error !== null) return error;
  const backup = data as FullBackup;
  await useSpeaking().importData(backup.speaking);
  await useVocab().importData(backup.vocab);
  return null;
}

/** 清空复习、口语、测评和阅读的记录，保留词库里自己添加的词条和生词、句子、STAR 故事、设置 */
export async function clearAllProgress(): Promise<void> {
  await useApp().clearProgress();
  await useSpeaking().clearHistory();
  await useVocab().clearHistory();
}
