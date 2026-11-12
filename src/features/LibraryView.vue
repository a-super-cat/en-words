<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import EntryDetail from '../components/EntryDetail.vue';
import { entryStatus, type EntryStatus } from '../srs/stats';
import { useApp } from '../stores/app';
import type { Layer } from '../types';

const PAGE = 60;
const STATUS_LABEL: Record<EntryStatus, string> = {
  new: '未学',
  learning: '学习中',
  mature: '已掌握',
  suspended: '已暂停',
};
const STATUS_CLASS: Record<EntryStatus, string> = { new: '', learning: 'accent', mature: 'good', suspended: 'warn' };

const app = useApp();
const route = useRoute();

const q = ref(typeof route.query.q === 'string' ? route.query.q : '');
const layer = ref<'' | Layer>('');
const category = ref('');
const status = ref<'' | EntryStatus>('');
const limit = ref(PAGE);
const openId = ref<string | null>(null);

const categoryOptions = computed(() => app.categories.filter((c) => !layer.value || c.layer === layer.value));

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase();
  return app.entries
    .map((entry) => ({ entry, status: entryStatus(entry, app.cards) }))
    .filter(
      ({ entry: e, status: s }) =>
        (!layer.value || e.layer === layer.value) &&
        (!category.value || e.category === category.value) &&
        (!status.value || s === status.value) &&
        (!needle || e.term.toLowerCase().includes(needle) || e.zh.toLowerCase().includes(needle)),
    );
});
const shown = computed(() => filtered.value.slice(0, limit.value));

watch(layer, () => (category.value = ''));
watch([q, layer, category, status], () => (limit.value = PAGE));
// 从复习页点过来时只有一条结果，直接展开
watch(
  filtered,
  (list) => {
    if (list.length === 1) openId.value = list[0].entry.id;
  },
  { immediate: true },
);

// 滚动到列表底部附近时自动多显示一页：底部放一个哨兵元素，它快进入视口时就加载
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | undefined;

onMounted(() => {
  observer = new IntersectionObserver(
    (hits) => {
      if (hits.some((h) => h.isIntersecting) && filtered.value.length > limit.value) limit.value += PAGE;
    },
    { rootMargin: '600px' },
  );
  if (sentinel.value) observer.observe(sentinel.value);
});
onBeforeUnmount(() => observer?.disconnect());

// 观察器只在哨兵进出视口时通知。窗口很高或筛选结果变化后，哨兵可能一直留在视口里，
// 所以每次列表变化后重新观察一次，让它按当前位置再判断一遍。
watch([limit, filtered], async () => {
  await nextTick();
  if (!sentinel.value || !observer) return;
  observer.unobserve(sentinel.value);
  observer.observe(sentinel.value);
});

const adding = ref(false);
const draft = reactive({ term: '', zh: '', en: '', exampleZh: '', layer: 'C' as Layer });
const addError = ref('');

async function add() {
  addError.value = (await app.addUserEntry(draft)) ?? '';
  if (addError.value) return;
  q.value = draft.term.trim();
  Object.assign(draft, { term: '', zh: '', en: '', exampleZh: '' });
  adding.value = false;
}
</script>

<template>
  <div class="stack">
    <div class="row between">
      <h1>词库</h1>
      <button type="button" @click="adding = !adding">{{ adding ? '取消' : '添加词条' }}</button>
    </div>

    <form v-if="adding" class="panel stack" @submit.prevent="add">
      <div class="grid">
        <label class="field">英文词或词块<input v-model="draft.term" type="text" required /></label>
        <label class="field">中文提示<input v-model="draft.zh" type="text" required /></label>
        <label class="field">例句（英文，可不填）<input v-model="draft.en" type="text" /></label>
        <label class="field">例句（中文）<input v-model="draft.exampleZh" type="text" /></label>
        <label class="field">
          归到哪一层
          <select v-model="draft.layer">
            <option value="B">B 职场沟通</option>
            <option value="C">C 技术和面试</option>
            <option value="A">A 通用核心</option>
            <option value="D">D 学术书面（只练认读）</option>
          </select>
        </label>
      </div>
      <p v-if="addError" class="notice bad">{{ addError }}</p>
      <div><button type="submit" class="primary">添加</button></div>
    </form>

    <div class="row">
      <input v-model="q" type="search" class="grow" placeholder="搜索英文或中文" aria-label="搜索" />
      <select v-model="layer" aria-label="层">
        <option value="">全部层</option>
        <option v-for="l in ['A', 'B', 'C', 'D']" :key="l" :value="l">{{ l }} 层</option>
      </select>
      <select v-model="category" aria-label="分类">
        <option value="">全部分类</option>
        <option v-for="c in categoryOptions" :key="c.key" :value="c.key">{{ c.title }}</option>
      </select>
      <select v-model="status" aria-label="状态">
        <option value="">全部状态</option>
        <option v-for="(label, key) in STATUS_LABEL" :key="key" :value="key">{{ label }}</option>
      </select>
    </div>

    <p class="muted small">共 {{ filtered.length }} 条</p>

    <ul class="list">
      <li v-for="{ entry, status: s } in shown" :key="entry.id">
        <button
          type="button"
          class="item"
          :aria-expanded="openId === entry.id"
          @click="openId = openId === entry.id ? null : entry.id"
        >
          <span class="grow">
            <span class="term">{{ entry.term }}</span>
            <span class="muted small zh">{{ entry.zh }}</span>
          </span>
          <span class="badge" :class="STATUS_CLASS[s]">{{ STATUS_LABEL[s] }}</span>
        </button>
        <EntryDetail v-if="openId === entry.id" :entry="entry" />
      </li>
    </ul>

    <div ref="sentinel" class="center muted small" aria-live="polite">
      {{ filtered.length > limit ? '正在加载更多…' : filtered.length > PAGE ? `已显示全部 ${filtered.length} 条` : '' }}
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.list li + li {
  border-top: 1px solid var(--border);
}

.item {
  width: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  text-align: left;
  justify-content: flex-start;
  padding: 10px 16px;
}

.item:hover {
  background: var(--bg);
}

.term {
  font-weight: 600;
}

.zh {
  margin-left: 10px;
}

.list :deep(.detail) {
  margin: 0 12px 12px;
}
</style>
