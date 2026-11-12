<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useApp } from '../stores/app';
import { useSpeaking } from '../stores/speaking';

const app = useApp();
const speaking = useSpeaking();
const router = useRouter();
onMounted(app.tick);

const category = ref('');

const counts = computed(() => {
  const out = new Map<string, number>();
  for (const a of speaking.attempts) {
    // 一题连答两遍算练了一次
    if (a.round === 1) out.set(a.questionId, (out.get(a.questionId) ?? 0) + 1);
  }
  return out;
});

const groups = computed(() =>
  speaking.questionCategories
    .filter((c) => !category.value || c.key === category.value)
    .map((c) => {
      const questions = speaking.questions.filter((q) => q.category === c.key);
      return { ...c, questions, done: questions.filter((q) => counts.value.has(q.id)).length };
    }),
);

function draw() {
  const q = speaking.nextQuestion(category.value || undefined);
  if (q) void router.push(`/speak/${q.id}`);
}
</script>

<template>
  <div class="stack">
    <div class="row between">
      <h1>口语练习</h1>
      <span class="muted small">今天练了 {{ speaking.today.questions }} 题</span>
    </div>

    <section class="panel stack">
      <p class="muted small">
        每道题答两遍：第一遍 2 分钟，回听并对照提纲；第二遍限时 90 秒。第二遍通常明显更顺。
      </p>
      <div class="row">
        <button type="button" class="primary" :disabled="speaking.questions.length === 0" @click="draw">抽一题</button>
        <select v-model="category" aria-label="题目分类">
          <option value="">全部分类</option>
          <option v-for="c in speaking.questionCategories" :key="c.key" :value="c.key">{{ c.title }}</option>
        </select>
        <span class="grow" />
        <RouterLink to="/speak/stories" class="btn">我的 STAR 故事</RouterLink>
        <RouterLink to="/speak/system-design" class="btn">系统设计讲解框架</RouterLink>
      </div>
    </section>

    <p v-if="speaking.questions.length === 0" class="muted">题库还是空的。</p>

    <section v-for="g in groups" :key="g.key" class="stack">
      <div class="row between">
        <h2>{{ g.title }}</h2>
        <span class="muted small">练过 {{ g.done }} / {{ g.questions.length }}</span>
      </div>
      <ul class="list">
        <li v-for="q in g.questions" :key="q.id">
          <RouterLink :to="`/speak/${q.id}`" class="item">
            <span class="grow">
              <span class="prompt">{{ q.prompt }}</span>
              <span class="muted small zh">{{ q.zh }}</span>
            </span>
            <span v-if="counts.get(q.id)" class="badge good">练过 {{ counts.get(q.id) }} 次</span>
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

.prompt {
  display: block;
  font-weight: 500;
}

.zh {
  display: block;
}
</style>
