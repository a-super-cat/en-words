<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';

/** 播放一段录音。对象 URL 在录音变化和组件卸载时释放。 */
const props = defineProps<{ blob: Blob }>();
const url = ref('');

watch(
  () => props.blob,
  (blob) => {
    if (url.value) URL.revokeObjectURL(url.value);
    url.value = URL.createObjectURL(blob);
  },
  { immediate: true },
);
onBeforeUnmount(() => URL.revokeObjectURL(url.value));
</script>

<template>
  <audio :src="url" controls preload="metadata" />
</template>

<style scoped>
audio {
  width: 100%;
  max-width: 420px;
  height: 36px;
}
</style>
