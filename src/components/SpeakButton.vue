<script setup lang="ts">
import { speak, ttsSupported } from '../lib/tts';
import { useApp } from '../stores/app';

const props = defineProps<{ text: string }>();
const app = useApp();

const play = () => speak(props.text, app.settings);
</script>

<template>
  <button v-if="ttsSupported" type="button" class="ghost icon" title="朗读" aria-label="朗读" @click.stop="play">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" stroke-linejoin="round" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke-linecap="round" />
    </svg>
  </button>
</template>
