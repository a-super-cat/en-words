<script setup lang="ts">
import { ref } from 'vue';
import { useApp } from '../stores/app';
import type { Chunk, Layer } from '../types';
import SpeakButton from './SpeakButton.vue';

/**
 * 一组要用上的表达。带 v-model 时每条前面有勾选框，用来记“这次回答用上了哪些”。
 * 还没在复习里的表达可以一键加入复习。
 */
const props = defineProps<{ chunks: Chunk[]; layer: Layer; hideAdd?: boolean }>();
const used = defineModel<string[]>();
const app = useApp();
const error = ref('');

function toggle(term: string, on: boolean) {
  const next = new Set(used.value ?? []);
  if (on) next.add(term);
  else next.delete(term);
  used.value = [...next];
}

async function add(chunk: Chunk) {
  error.value = (await app.addChunk(chunk, props.layer)) ?? '';
}
</script>

<template>
  <ul class="chunks">
    <li v-for="c in chunks" :key="c.term">
      <label class="row main">
        <input
          v-if="used"
          type="checkbox"
          :checked="used.includes(c.term)"
          @change="toggle(c.term, ($event.target as HTMLInputElement).checked)"
        />
        <span class="term">{{ c.term }}</span>
        <span class="muted small">{{ c.zh }}</span>
      </label>
      <SpeakButton :text="c.term" />
      <template v-if="!hideAdd">
        <span v-if="app.chunkStatus(c) === 'reviewing'" class="badge good">已在复习</span>
        <button v-else type="button" class="add" @click="add(c)">加入复习</button>
      </template>
    </li>
  </ul>
  <p v-if="error" class="notice bad">{{ error }}</p>
</template>

<style scoped>
.chunks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chunks li {
  display: flex;
  align-items: center;
  gap: 6px;
}

.main {
  flex: 1;
  min-width: 0;
  gap: 8px;
}

.term {
  font-weight: 600;
}

.add {
  padding: 2px 10px;
  font-size: 0.8rem;
  white-space: nowrap;
}
</style>
