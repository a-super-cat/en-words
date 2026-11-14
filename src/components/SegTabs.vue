<script setup lang="ts">
// 顶部切换（分段控件）：移动端常见的二选一/多选一切换，选中项是浮起的“拇指块”
defineProps<{ modelValue: string; options: { key: string; label: string }[] }>();
const emit = defineEmits<{ 'update:modelValue': [key: string] }>();
</script>

<template>
  <div class="seg" role="tablist">
    <button
      v-for="o in options"
      :key="o.key"
      type="button"
      role="tab"
      :aria-selected="modelValue === o.key"
      :class="{ on: modelValue === o.key }"
      @click="emit('update:modelValue', o.key)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--text) 7%, transparent);
}

.seg button {
  flex: 1;
  border: 0;
  background: transparent;
  padding: 8px 4px;
  border-radius: 9px;
  font-size: 0.95rem;
  color: var(--muted);
  cursor: pointer;
}

.seg button.on {
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
</style>
