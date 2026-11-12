import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { db } from '../db';
import { azureEndpoint, buildSsml, ttsCacheKey } from './azure';

// 安卓 WebView 自带的 speechSynthesis 没有声音（2026-11-12 真机实测），
// 所以原生平台改走手机系统自带的 TTS 引擎（社区插件），网页版保持 speechSynthesis 不变。
// 第三条分支是 Azure 神经网络语音（2026-11-12 用户选定）：自然度接近桌面 Edge 的 Natural 语音，
// 代价是要联网、用自己的 Azure 密钥；合成结果按句缓存进 IndexedDB，重复句子不重复花额度，
// 断网、没填密钥或合成失败时自动回退到系统语音，不挡练习。
const native = Capacitor.isNativePlatform();

export interface SpeakOptions {
  voice: string;
  rate: number;
  ttsEngine?: 'system' | 'azure';
  azureKey?: string;
  azureRegion?: string;
  azureVoice?: string;
}

export const ttsSupported =
  native || (typeof window !== 'undefined' && 'speechSynthesis' in window);

let cache: SpeechSynthesisVoice[] = [];
// 原生插件的 voice 参数是语音在完整列表里的下标，所以完整列表要单独留着，不能只存过滤后的
let nativeAll: SpeechSynthesisVoice[] = [];

const english = (list: SpeechSynthesisVoice[]) => list.filter((v) => v.lang.toLowerCase().startsWith('en'));

/** 英文语音列表。浏览器是异步加载语音的，第一次可能要等 voiceschanged。 */
export async function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!ttsSupported) return [];
  if (native) {
    if (cache.length > 0) return cache;
    try {
      // 插件返回的对象和 SpeechSynthesisVoice 同形状（name / lang 等），界面只用 name 和 lang
      nativeAll = (await TextToSpeech.getSupportedVoices()).voices as SpeechSynthesisVoice[];
      cache = english(nativeAll);
    } catch {
      cache = [];
    }
    return cache;
  }
  const now = english(speechSynthesis.getVoices());
  if (now.length > 0) return Promise.resolve((cache = now));
  return new Promise((resolve) => {
    const done = () => {
      speechSynthesis.removeEventListener('voiceschanged', done);
      resolve((cache = english(speechSynthesis.getVoices())));
    };
    speechSynthesis.addEventListener('voiceschanged', done);
    setTimeout(done, 1500);
  });
}

function pickVoice(name: string): SpeechSynthesisVoice | undefined {
  if (cache.length === 0) cache = english(speechSynthesis.getVoices());
  return (
    cache.find((v) => v.name === name) ??
    // Edge 的 Natural 语音和 Chrome 的 Google 语音明显比系统默认语音自然
    cache.find((v) => v.lang === 'en-US' && /natural/i.test(v.name)) ??
    cache.find((v) => v.lang === 'en-US' && /google/i.test(v.name)) ??
    cache.find((v) => v.lang === 'en-US') ??
    cache[0]
  );
}

function pickNativeVoice(name: string): SpeechSynthesisVoice | undefined {
  const en = english(nativeAll);
  return (
    en.find((v) => v.name === name) ??
    en.find((v) => v.lang === 'en-US') ??
    en[0]
  );
}

/** 句型里的空位（...）读成一个停顿 */
const speakable = (text: string) => text.replace(/\s*(\.\.\.|…)\s*/g, ', ').replace(/^, |, $/g, '');

async function speakNative(text: string, opts: { voice: string; rate: number }): Promise<void> {
  try {
    if (nativeAll.length === 0) await loadVoices();
    const voice = pickNativeVoice(opts.voice);
    const index = voice ? nativeAll.indexOf(voice) : -1;
    await TextToSpeech.speak({
      text,
      lang: voice?.lang ?? 'en-US',
      rate: opts.rate,
      // 插件默认就是 Flush：新的一句会顶掉正在读的，和网页版 cancel 后再读的行为一致
      ...(index >= 0 ? { voice: index } : {}),
    });
  } catch {
    // 朗读失败（比如手机没装 TTS 引擎）和网页版拿不到语音时一样，不挡住练习流程
  }
}

function speakSystem(text: string, opts: SpeakOptions): void {
  if (native) {
    void speakNative(text, opts);
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(opts.voice);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'en-US';
  u.rate = opts.rate;
  speechSynthesis.speak(u);
}

// Azure 音频用 Audio 元素播；seq 用来丢弃「已经翻页了才返回」的过期合成结果
let currentAudio: HTMLAudioElement | null = null;
let currentUrl = '';
let azureSeq = 0;

function stopAzureAudio(): void {
  azureSeq++;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = '';
  }
}

const AZURE_CACHE_LIMIT = 300;

async function fetchAzureBlob(text: string, opts: SpeakOptions): Promise<Blob> {
  const key = ttsCacheKey(text, opts.azureVoice!, opts.rate);
  const hit = await db.ttsCache.get(key).catch(() => undefined);
  if (hit) return hit.blob;
  const res = await fetch(azureEndpoint(opts.azureRegion || 'eastus'), {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': opts.azureKey!,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
    },
    body: buildSsml(text, opts.azureVoice!, opts.rate),
  });
  if (!res.ok) throw new Error(`azure tts ${res.status}`);
  const blob = await res.blob();
  // 存普通对象（Blob 本身就是普通数据），顺手把缓存控制在上限内，删最旧的
  await db.ttsCache.put({ key, blob, at: Date.now() }).catch(() => {});
  const count = await db.ttsCache.count().catch(() => 0);
  if (count > AZURE_CACHE_LIMIT) {
    const stale = await db.ttsCache.orderBy('at').limit(count - AZURE_CACHE_LIMIT).primaryKeys().catch(() => []);
    if (stale.length > 0) await db.ttsCache.bulkDelete(stale).catch(() => {});
  }
  return blob;
}

async function speakAzure(text: string, opts: SpeakOptions): Promise<void> {
  const seq = ++azureSeq;
  try {
    const blob = await fetchAzureBlob(text, opts);
    if (seq !== azureSeq) return; // 等待期间已经翻页或按了停止，丢弃这次结果
    stopAzureAudio();
    const keepSeq = azureSeq;
    currentUrl = URL.createObjectURL(blob);
    currentAudio = new Audio(currentUrl);
    currentAudio.onended = () => {
      if (keepSeq === azureSeq) stopAzureAudio();
    };
    await currentAudio.play();
  } catch {
    // 断网、密钥错、额度用完都走这里：回退系统语音，至少有声
    if (seq === azureSeq) speakSystem(text, opts);
  }
}

export function speak(text: string, opts: SpeakOptions): void {
  if (!ttsSupported || !text) return;
  const clean = speakable(text);
  if (opts.ttsEngine === 'azure' && opts.azureKey?.trim()) {
    void speakAzure(clean, opts);
    return;
  }
  stopAzureAudio();
  speakSystem(clean, opts);
}

export function stopSpeaking(): void {
  stopAzureAudio();
  if (native) {
    void TextToSpeech.stop().catch(() => {});
    return;
  }
  if (ttsSupported) speechSynthesis.cancel();
}
