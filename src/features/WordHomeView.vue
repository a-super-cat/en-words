<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue';
import { useApp } from '../stores/app';
import { useVocab } from '../stores/vocab';
import { useWords } from '../stores/words';
import { loadDictionary, type Dictionary } from '../vocab/dictionary';
import { buildWordQueue, introducedToday, wordStatus } from '../vocab/words';
import VocabView from './VocabView.vue';

const app = useApp();
const vocab = useVocab();
const words = useWords();
const dict = shallowRef<Dictionary | null>(null);
onMounted(async () => (dict.value = await loadDictionary()));

const queue = computed(() => {
  const d = dict.value;
  if (!d) return null;
  const now = Date.now();
  return buildWordQueue({
    cards: words.all,
    notebookWords: vocab.notebook.map((e) => e.term),
    ranked: d.ranked,
    marks: vocab.marks,
    knownRank: app.settings.knownRank,
    newLimit: app.settings.newWordsPerDay - introducedToday(words.all, now),
    now,
  });
});

const todayTotal = computed(() => (queue.value ? queue.value.due.length + queue.value.fresh.length : 0));

const bookStats = computed(() => {
  let fresh = 0;
  let learning = 0;
  let mature = 0;
  for (const e of vocab.notebook) {
    const s = wordStatus(words.cards.get(e.term.toLowerCase()));
    if (s === 'mature') mature++;
    else if (s === 'learning') learning++;
    else if (s === 'new') fresh++;
  }
  return { total: vocab.notebook.length, fresh, learning, mature };
});

const learnedTotal = computed(() => words.all.length);
</script>

<template>
  <div class="stack">
    <section class="panel stack">
      <div class="row between">
        <h2>今日单词</h2>
        <span v-if="queue" class="muted small">
          待复习 {{ queue.due.length }} · 新词 {{ queue.fresh.length }}
        </span>
        <span v-else class="muted small">正在加载词典…</span>
      </div>
      <p class="muted small">
        单词有自己的一条线：按遗忘曲线排期，和词条分开计数。生词本里的词优先学，其余按词频从高到低推进；每天新词上限
        {{ app.settings.newWordsPerDay }} 个，在设置里改。
      </p>
      <div>
        <RouterLink v-if="todayTotal > 0" to="/words/study" class="btn primary">开始学习（{{ todayTotal }}）</RouterLink>
        <span v-else-if="queue" class="muted">今天的单词学完了。</span>
      </div>
      <p class="muted small">已引入 {{ learnedTotal }} 个词进入长期复习。</p>
    </section>

    <RouterLink to="/words/notebook" class="entry-card">
      <span class="grow">
        <span class="name">生词本</span>
        <span class="muted small">
          共 {{ bookStats.total }} 个 · 待学 {{ bookStats.fresh }} · 学习中 {{ bookStats.learning }} · 已掌握
          {{ bookStats.mature }}
        </span>
      </span>
      <span class="chev">›</span>
    </RouterLink>

    <VocabView embedded />
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
