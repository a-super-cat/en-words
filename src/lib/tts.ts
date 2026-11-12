import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

// 安卓 WebView 自带的 speechSynthesis 没有声音（2026-11-12 真机实测），
// 所以原生平台改走手机系统自带的 TTS 引擎（社区插件），网页版保持 speechSynthesis 不变。
const native = Capacitor.isNativePlatform();

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

export function speak(text: string, opts: { voice: string; rate: number }): void {
  if (!ttsSupported || !text) return;
  if (native) {
    void speakNative(speakable(text), opts);
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text));
  const voice = pickVoice(opts.voice);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'en-US';
  u.rate = opts.rate;
  speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (native) {
    void TextToSpeech.stop().catch(() => {});
    return;
  }
  if (ttsSupported) speechSynthesis.cancel();
}
