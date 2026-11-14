<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useApp } from '../stores/app';
import { useSpeaking } from '../stores/speaking';

const props = defineProps<{ scope?: 'work' | 'life'; embedded?: boolean }>();

const app = useApp();
const speaking = useSpeaking();
const router = useRouter();
onMounted(app.tick);

const counts = computed(() => {
  const out = new Map<string, number>();
  for (const r of speaking.runs) out.set(r.scenarioId, (out.get(r.scenarioId) ?? 0) + 1);
  return out;
});

// 工作和生活分开列：生活只看旅游分类，工作看其余分类，两边互不混排
const groups = computed(() =>
  speaking.scenarioCategories
    .filter((c) => !props.scope || (props.scope === 'life' ? c.key === 'travel' : c.key !== 'travel'))
    .map((c) => ({
      ...c,
      scenarios: speaking.scenarios.filter((s) => s.category === c.key),
    })),
);

const visible = computed(() => groups.value.flatMap((g) => g.scenarios));

function draw() {
  if (props.scope === 'life') {
    const s = speaking.nextScenario('travel');
    if (s) void router.push(`/scenarios/${s.id}`);
    return;
  }
  if (props.scope === 'work') {
    const pool = visible.value;
    if (pool.length > 0) void router.push(`/scenarios/${pool[Math.floor(Math.random() * pool.length)].id}`);
    return;
  }
  const s = speaking.nextScenario();
  if (s) void router.push(`/scenarios/${s.id}`);
}
</script>

<template>
  <div class="stack">
    <div v-if="!embedded" class="row between">
      <h1>场景对话</h1>
      <span class="muted small">今天练了 {{ speaking.today.scenarios }} 个</span>
    </div>

    <section class="panel stack">
      <p class="muted small">
        {{ scope === 'life' ? '对方' : '同事' }}的话由语音读出来，先听，听不清再看原文。轮到你时，看着中文意思开口说，再对照参考说法。
      </p>
      <div>
        <button type="button" class="primary" :disabled="visible.length === 0" @click="draw">随机来一个</button>
      </div>
    </section>

    <p v-if="visible.length === 0" class="muted">场景库还是空的。</p>

    <section v-for="g in groups" :key="g.key" class="stack">
      <h2>{{ g.title }}</h2>
      <ul class="list">
        <li v-for="s in g.scenarios" :key="s.id">
          <RouterLink :to="`/scenarios/${s.id}`" class="item">
            <span class="grow">
              <span class="name">{{ s.title }}</span>
              <span class="muted small setting">{{ s.setting }}</span>
            </span>
            <span v-if="counts.get(s.id)" class="badge good">练过 {{ counts.get(s.id) }} 次</span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
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
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  color: inherit;
  text-decoration: none;
}

.item:hover {
  background: var(--bg);
}

.name {
  display: block;
  font-weight: 600;
}

.setting {
  display: block;
}
</style>
