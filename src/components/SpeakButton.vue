<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { recorderSupported, useRecorder } from '../lib/recorder';
import { speak, ttsSupported } from '../lib/tts';
import { useApp } from '../stores/app';

/**
 * 朗读按钮，旁边带一个录音对比：听完原音点麦克风录自己，录完自动回放，
 * 再点喇叭听原音、点“我的”重听自己，来回对比发音。录音只留在本机内存，不保存。
 * 已经有专门录音流程的地方（如口语答题页）传 norecord 关掉，避免两个录音按钮打架。
 */
const props = defineProps<{ text: string; norecord?: boolean }>();
const app = useApp();
const recorder = useRecorder();

const mine = ref<Blob | null>(null);
const elapsed = ref(0);
const hint = ref('');
let mineUrl = '';
let audio: HTMLAudioElement | undefined;
let timer: number | undefined;

const recording = computed(() => recorder.state.value === 'recording');
const showRecord = computed(() => recorderSupported && !props.norecord);
const timeText = computed(() => {
  const s = Math.floor(elapsed.value);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
});

const play = () => speak(props.text, app.settings);

async function toggleRecord() {
  if (recording.value) {
    await stopRec();
    return;
  }
  hint.value = '';
  const ok = await recorder.start();
  if (!ok) {
    hint.value = recorder.state.value === 'denied' ? '没有麦克风权限' : '这个设备录不了音';
    return;
  }
  audio?.pause();
  elapsed.value = 0;
  timer = window.setInterval(() => {
    elapsed.value += 0.2;
    if (elapsed.value >= 90) void stopRec(); // 跟读对比用，90 秒封顶自动停
  }, 200);
}

async function stopRec() {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
  const blob = await recorder.stop();
  if (blob) {
    mine.value = blob;
    playMine();
  }
}

function playMine() {
  if (!mine.value) return;
  if (mineUrl) URL.revokeObjectURL(mineUrl);
  mineUrl = URL.createObjectURL(mine.value);
  audio?.pause();
  audio = new Audio(mineUrl);
  void audio.play().catch(() => undefined);
}

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  audio?.pause();
  if (mineUrl) URL.revokeObjectURL(mineUrl);
});
</script>

<template>
  <span class="speak-rec">
    <button v-if="ttsSupported" type="button" class="ghost icon" title="朗读" aria-label="朗读" @click.stop="play">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" stroke-linejoin="round" />
        <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke-linecap="round" />
      </svg>
    </button>
    <button
      v-if="showRecord"
      type="button"
      class="ghost icon"
      :class="{ rec: recording }"
      :title="recording ? '点一下停止录音' : '录下我的发音，和原音对比'"
      aria-label="录音对比"
      @click.stop="toggleRecord"
    >
      <svg v-if="recording" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </svg>
      <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" stroke-linejoin="round" />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke-linecap="round" />
      </svg>
    </button>
    <span v-if="recording" class="rec-time">{{ timeText }}</span>
    <button v-else-if="mine" type="button" class="ghost mine" title="播放我的录音" @click.stop="playMine">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M7 4.5v15l13-7.5z" stroke-linejoin="round" />
      </svg>
      <span>我的</span>
    </button>
    <span v-if="hint" class="hint">{{ hint }}</span>
  </span>
</template>

<style scoped>
.speak-rec {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.rec {
  color: var(--bad);
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.45;
  }
}

.rec-time {
  font-size: 0.8rem;
  color: var(--bad);
  font-variant-numeric: tabular-nums;
}

.mine {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.8rem;
}

.hint {
  font-size: 0.75rem;
  color: var(--bad);
}
</style>
