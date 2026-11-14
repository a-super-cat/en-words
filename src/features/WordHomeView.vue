<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { useApp } from '../stores/app';
import { useVocab } from '../stores/vocab';
import { useWords } from '../stores/words';
import { bandOf } from '../vocab/assess';
import { loadDictionary, type Dictionary, type DictWord } from '../vocab/dictionary';
import { bandProgress, buildWordQueue, introducedToday, wordStatus } from '../vocab/words';
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

// 查词：前缀匹配优先，其次包含匹配，最多给 15 个候选，点进去看详情、加进学习
const query = ref('');
const searchResults = computed(() => {
  const d = dict.value;
  const needle = query.value.trim().toLowerCase();
  if (!d || needle.length < 2) return [];
  const starts: DictWord[] = [];
  const contains: DictWord[] = [];
  for (const w of d.ranked) {
    const key = w.word.toLowerCase();
    if (key.startsWith(needle)) starts.push(w);
    else if (key.includes(needle)) contains.push(w);
    if (starts.length >= 15) break;
  }
  return [...starts, ...contains].slice(0, 15);
});

// 词频段进度：默认只列到正在推进的那一段，全部段落可以展开
const bands = computed(() =>
  dict.value ? bandProgress(dict.value.ranked, words.all, vocab.marks) : [],
);
const showAllBands = ref(false);
const visibleBands = computed(() => {
  if (showAllBands.value) return bands.value;
  let frontier = bandOf(app.settings.knownRank);
  for (const b of bands.value) {
    if (b.mastered + b.learning + b.suspended > 0) frontier = Math.max(frontier, b.band);
  }
  return bands.value.filter((b) => b.band <= frontier + 1);
});
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

    <section class="panel stack">
      <h2>查词</h2>
      <input v-model="query" type="search" placeholder="输入英文单词，看详情或加入学习" aria-label="查词" />
      <ul v-if="searchResults.length > 0" class="list">
        <li v-for="w in searchResults" :key="w.word">
          <RouterLink :to="`/words/word/${encodeURIComponent(w.word.toLowerCase())}`" class="item">
            <span class="grow">
              <span class="name">{{ w.word }}</span>
              <span class="muted small">{{ w.zh }}</span>
            </span>
            <span class="chev">›</span>
          </RouterLink>
        </li>
      </ul>
      <p v-else-if="query.trim().length >= 2 && dict" class="muted small">词典里没找到这个词。</p>
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

    <section class="panel stack">
      <h2>词频段进度</h2>
      <p class="muted small">每段 1000 个词，按词频从高到低。点一段看这一段的词表，可以单个加入或暂停。</p>
      <div v-for="b in visibleBands" :key="b.band" class="band-row">
        <RouterLink :to="`/words/band/${b.band}`" class="band-head">
          <span class="grow">
            第 {{ b.band }} 段
            <span class="muted small">
              已掌握 {{ b.mastered }} · 学习中 {{ b.learning }} · 待学 {{ b.remaining + b.known }}
            </span>
          </span>
          <span class="chev">›</span>
        </RouterLink>
        <div class="band-bar">
          <span class="done" :style="{ width: `${(b.mastered / b.total) * 100}%` }"></span>
          <span class="doing" :style="{ width: `${(b.learning / b.total) * 100}%` }"></span>
        </div>
      </div>
      <div v-if="!showAllBands && bands.length > visibleBands.length">
        <button type="button" class="ghost" @click="showAllBands = true">
          显示全部 {{ bands.length }} 段
        </button>
      </div>
    </section>

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

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.list li + li {
  border-top: 1px solid var(--border);
}

.list .item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  color: inherit;
  text-decoration: none;
}

.list .name {
  font-weight: 600;
  margin-right: 8px;
}

.list .chev {
  color: var(--muted);
  font-size: 1.3rem;
  line-height: 1;
}

.band-row + .band-row {
  margin-top: 10px;
}

.band-head {
  display: flex;
  align-items: center;
  gap: 12px;
  color: inherit;
  text-decoration: none;
  font-weight: 600;
}

.band-head .chev {
  color: var(--muted);
  font-size: 1.3rem;
  line-height: 1;
}

.band-bar {
  display: flex;
  height: 6px;
  margin-top: 6px;
  border-radius: 3px;
  background: var(--border);
  overflow: hidden;
}

.band-bar .done {
  background: var(--good);
}

.band-bar .doing {
  background: var(--accent);
}
</style>
