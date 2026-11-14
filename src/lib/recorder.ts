import { onBeforeUnmount, ref } from 'vue';

export type RecorderState = 'idle' | 'recording' | 'denied' | 'unsupported';

/** 当前环境能不能录音（需要 getUserMedia 和 MediaRecorder 都在） */
export const recorderSupported =
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof MediaRecorder !== 'undefined';

/** 用浏览器自带的 MediaRecorder 录音。录音只留在本机。拿不到麦克风时不报错，调用方照常计时练习。 */
export function useRecorder() {
  const state = ref<RecorderState>('idle');
  let recorder: MediaRecorder | undefined;
  let stream: MediaStream | undefined;
  let parts: Blob[] = [];

  const release = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = undefined;
  };

  async function start(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      state.value = 'unsupported';
      return false;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      state.value = 'denied';
      return false;
    }
    parts = [];
    try {
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) parts.push(e.data);
      };
      recorder.start();
    } catch {
      // 拿到了音频流但录不了（比如设备被占用、流已经结束）：同样退回只计时
      recorder = undefined;
      release();
      state.value = 'unsupported';
      return false;
    }
    state.value = 'recording';
    return true;
  }

  function stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const r = recorder;
      if (!r || r.state === 'inactive') {
        release();
        return resolve(null);
      }
      r.onstop = () => {
        release();
        state.value = 'idle';
        resolve(parts.length > 0 ? new Blob(parts, { type: r.mimeType }) : null);
      };
      r.stop();
    });
  }

  onBeforeUnmount(() => {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    release();
  });

  return { state, start, stop };
}
