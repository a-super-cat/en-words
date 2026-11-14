// Azure 语音服务（神经网络语音）的纯逻辑部分：SSML 拼装、缓存键、语音清单。
// 真正的联网请求在 tts.ts 里，这里不碰网络和存储，方便单测。

/** 设置页里可选的美式英语神经网络语音（名字是 Azure 的 voice name） */
export const AZURE_VOICES: { name: string; label: string }[] = [
  { name: 'en-US-JennyNeural', label: 'Jenny（女声，自然对话）' },
  { name: 'en-US-AriaNeural', label: 'Aria（女声，新闻播报感）' },
  { name: 'en-US-SaraNeural', label: 'Sara（女声，温和）' },
  { name: 'en-US-JaneNeural', label: 'Jane（女声，清晰）' },
  { name: 'en-US-GuyNeural', label: 'Guy（男声，自然对话）' },
  { name: 'en-US-DavisNeural', label: 'Davis（男声，沉稳）' },
  { name: 'en-US-JasonNeural', label: 'Jason（男声，清晰）' },
  { name: 'en-US-TonyNeural', label: 'Tony（男声，随和）' },
];

export const escapeXml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * 应用里的语速（0.6–1.3 倍率）换成 SSML prosody rate 的写法：直接用倍率数字。
 * 不能写百分比：Azure 的百分比是“在原速上增减”，"100%" 表示提速一倍而不是原速。
 * 2026-11-14 实测对照（Jenny 读同一长句）：无 prosody、rate="1"、rate="0%" 都是约 176 词/分，
 * 旧写法 rate="100%" 是约 348 词/分——这个 bug 从接入 Azure 起就在，滑杆全程没有一档是正常速度。
 */
export const ssmlRate = (rate: number): string => String(Math.round(rate * 100) / 100);

export function buildSsml(text: string, voice: string, rate: number): string {
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">` +
    `<voice name="${voice}"><prosody rate="${ssmlRate(rate)}">${escapeXml(text)}</prosody></voice></speak>`
  );
}

export const azureEndpoint = (region: string): string =>
  `https://${region.trim().toLowerCase()}.tts.speech.microsoft.com/cognitiveservices/v1`;

/** 缓存键：同一句 + 同一个嗓音 + 同一语速只合成一次。FNV-1a 哈希足够区分句子。 */
export function ttsCacheKey(text: string, voice: string, rate: number): string {
  const raw = `${voice}|${ssmlRate(rate)}|${text}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `azure:${voice}:${ssmlRate(rate)}:${(hash >>> 0).toString(16)}`;
}
