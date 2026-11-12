<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ text: string; term: string }>();

/** 在例句里标出词块。句型（带 ...）取最长的固定片段；找不到原样匹配时不标，避免标错。 */
const parts = computed(() => {
  const needle = props.term
    .split(/\.\.\.|…/)
    .map((s) => s.trim())
    .sort((a, b) => b.length - a.length)[0];
  const at = needle ? props.text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (at < 0) return [props.text, '', ''];
  return [props.text.slice(0, at), props.text.slice(at, at + needle.length), props.text.slice(at + needle.length)];
});
</script>

<template>
  <span>{{ parts[0] }}<mark v-if="parts[1]">{{ parts[1] }}</mark>{{ parts[2] }}</span>
</template>
