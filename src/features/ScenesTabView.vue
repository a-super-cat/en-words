<script setup lang="ts">
import { ref } from 'vue';
import SegTabs from '../components/SegTabs.vue';
import ScenarioListView from './ScenarioListView.vue';

// 工作和生活是平级的两个模式：旅游不再混在工作场景的分类列表里
const seg = ref('work');
</script>

<template>
  <div class="stack">
    <SegTabs
      v-model="seg"
      :options="[
        { key: 'work', label: '工作' },
        { key: 'life', label: '生活' },
      ]"
    />

    <template v-if="seg === 'work'">
      <RouterLink to="/speak" class="entry-card">
        <span class="grow">
          <span class="name">口语答题</span>
          <span class="muted small">面试题口头练习：看题、录音、对照参考说法</span>
        </span>
        <span class="chev">›</span>
      </RouterLink>
      <ScenarioListView scope="work" embedded />
    </template>

    <template v-else>
      <ScenarioListView scope="life" embedded />
      <RouterLink :to="{ path: '/words', query: { cat: 'a.travel' } }" class="entry-card">
        <span class="grow">
          <span class="name">旅游词汇</span>
          <span class="muted small">旅游娱乐分类的全部词条，出门前集中过一遍</span>
        </span>
        <span class="chev">›</span>
      </RouterLink>
    </template>
  </div>
</template>

<style scoped>
.entry-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: inherit;
  text-decoration: none;
}

.entry-card:active {
  background: var(--bg);
}

.entry-card .name {
  display: block;
  font-weight: 600;
}

.entry-card .chev {
  color: var(--muted);
  font-size: 1.3rem;
  line-height: 1;
}
</style>
