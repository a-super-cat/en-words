<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * 单一序列的柱状图：每天一根柱子。只有一个序列，所以不需要图例，标题说明画的是什么。
 * 鼠标移到某一天的整列上显示当天的数值；下方可以展开数据表。
 */
const props = defineProps<{
  title: string;
  unit: string;
  items: { label: string; value: number }[];
  /** 横轴每隔几根柱子标一个日期 */
  tickEvery?: number;
}>();

const active = ref<number | null>(null);
const max = computed(() => Math.max(1, ...props.items.map((i) => i.value)));
const total = computed(() => props.items.reduce((n, i) => n + i.value, 0));
const step = computed(() => props.tickEvery ?? 7);
// 提示框贴着柱子走，靠近两端时改成贴边对齐，避免伸出图外
const tipAlign = computed(() => {
  const i = active.value ?? 0;
  if (i < 3) return 'left';
  return i > props.items.length - 4 ? 'right' : 'center';
});
</script>

<template>
  <figure class="viz-root">
    <figcaption class="row between">
      <span class="title">{{ title }}</span>
      <span class="muted small">合计 {{ total }} {{ unit }} · 最多 {{ max === 1 && total === 0 ? 0 : max }} {{ unit }}</span>
    </figcaption>

    <div class="plot" role="img" :aria-label="`${title}：合计 ${total} ${unit}`" @mouseleave="active = null">
      <div
        v-for="(item, i) in items"
        :key="i"
        class="col"
        :class="{ on: active === i }"
        @mouseenter="active = i"
      >
        <span class="bar" :style="{ height: `${(item.value / max) * 100}%` }" />
      </div>
      <div
        v-if="active !== null"
        class="tip"
        :class="tipAlign"
        :style="{ left: `${((active + 0.5) / items.length) * 100}%` }"
      >
        {{ items[active].label }} · {{ items[active].value }} {{ unit }}
      </div>
    </div>

    <div class="axis muted small" aria-hidden="true">
      <span v-for="(item, i) in items" :key="i">{{ i % step === 0 ? item.label : '' }}</span>
    </div>

    <details>
      <summary class="muted small">看数据表</summary>
      <table>
        <tbody>
          <tr v-for="(item, i) in items" :key="i">
            <td>{{ item.label }}</td>
            <td class="n">{{ item.value }} {{ unit }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </figure>
</template>

<style scoped>
.viz-root {
  --series-1: #2a78d6;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

@media (prefers-color-scheme: dark) {
  .viz-root {
    --series-1: #3987e5;
  }
}

.title {
  font-weight: 600;
}

.plot {
  position: relative;
  display: flex;
  align-items: flex-end;
  /* 相邻柱子之间留 2px 的底色间隔 */
  gap: 2px;
  height: 140px;
  padding-top: 22px;
  border-bottom: 1px solid var(--border);
}

/* 整列都是鼠标的感应区，比柱子本身大，好瞄准 */
.col {
  position: relative;
  flex: 1;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-end;
}

.col.on {
  background: var(--bg);
}

.bar {
  width: 100%;
  max-width: 24px;
  min-height: 0;
  background: var(--series-1);
  /* 数据一端圆角，贴着基线的一端平直 */
  border-radius: 4px 4px 0 0;
}

.tip {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  padding: 1px 8px;
  border-radius: 6px;
  background: var(--text);
  color: var(--surface);
  font-size: 0.8rem;
  white-space: nowrap;
  pointer-events: none;
}

.tip.left {
  transform: none;
  left: 0 !important;
}

.tip.right {
  transform: none;
  left: auto !important;
  right: 0;
}

.axis {
  display: flex;
  gap: 2px;
}

.axis span {
  flex: 1;
  white-space: nowrap;
  overflow: visible;
  width: 0;
}

details table {
  max-width: 280px;
}
</style>
