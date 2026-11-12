export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

let cache: SpeechSynthesisVoice[] = [];

const english = (list: SpeechSynthesisVoice[]) => list.filter((v) => v.lang.toLowerCase().startsWith('en'));

/** 英文语音列表。浏览器是异步加载语音的，第一次可能要等 voiceschanged。 */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!ttsSupported) return Promise.resolve([]);
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

/** 句型里的空位（...）读成一个停顿 */
const speakable = (text: string) => text.replace(/\s*(\.\.\.|…)\s*/g, ', ').replace(/^, |, $/g, '');

export function speak(text: string, opts: { voice: string; rate: number }): void {
  if (!ttsSupported || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text));
  const voice = pickVoice(opts.voice);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'en-US';
  u.rate = opts.rate;
  speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (ttsSupported) speechSynthesis.cancel();
}
