<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { useRoute } from 'vue-router';
import { useVocab } from '../stores/vocab';
import { useWords } from '../stores/words';
import { bandOf } from '../vocab/assess';
import { loadDictionary, type Dictionary, type DictWord } from '../vocab/dictionary';
import { bandProgress, wordStatus, type WordStatus } from '../vocab/words';

const PAGE = 100;

const route = useRoute();
const vocab = useVocab();
const words = useWords();
const dict = shallowRef<Dictionary | null>(null);
onMounted(async () => (dict.value = await loadDictionary()));

const band = computed(() => Math.max(1, Number(route.params.band) || 1));
const q = ref('');
const shown = ref(PAGE);

const all = computed<DictWord[]>(() =>
  dict.value ? dict.value.ranked.filter((d) => d.rank !== null && bandOf(d.rank) === band.value) : [],
);

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase();
  if (!needle) return all.value;
  return all.value.filter(
    (d) => d.word.toLowerCase().includes(needle) || d.zh.includes(q.value.trim()),
  );
});

const visible = computed(() => filtered.value.slice(0, shown.value));

const progress = computed(() =>
  dict.value ? bandProgress(dict.value.ranked, words.all, vocab.marks).find((b) => b.band === band.value) : undefined,
);

const STATUS_LABEL: Record<WordStatus, string> = {
  new: '待学',
  learning: '学习中',
  mature: '已掌握',
  suspended: '已暂停',
};

function statusOf(d: DictWord): WordStatus {
  return wordStatus(words.cards.get(d.word.toLowerCase()));
}

async function act(d: DictWord) {
  const key = d.word.toLowerCase();
  const s = statusOf(d);
  if (s === 'new') await words.enqueue(key);
  else if (s === 'suspended') await words.setSuspended(key, false);
  else await words.setSuspended(key, true);
}
</script>

<template>
  <div class="stack">
    <div class="row between">
      <RouterLink to="/words" class="muted small back">‹ 单词</RouterLink>
      <span v-if="progress" class="muted small">
        已掌握 {{ progress.mastered }} · 学习中 {{ progress.learning }} · 待学 {{ progress.remaining + progress.known }}
      </span>
    </div>
    <h1>第 {{ band }} 段 · 词频 {{ (band - 1) * 1000 + 1 }}–{{ band * 1000 }}</h1>

    <input v-model="q" type="search" placeholder="在这一段里搜单词或中文" aria-label="搜索" />

    <p v-if="!dict" class="muted">正在加载词典…</p>
    <p v-else-if="filtered.length === 0" class="muted">没有匹配的词。</p>

    <ul class="list">
      <li v-for="d in visible" :key="d.word" class="item">
        <RouterLink :to="`/words/word/${encodeURIComponent(d.word.toLowerCase())}`" class="grow link">
          <span class="name">{{ d.word }}</span>
          <span class="muted small">
            <template v-if="d.phonetic">/{{ d.phonetic }}/ · </template>{{ d.zh }}
          </span>
        </RouterLink>
        <span
          class="badge"
          :class="{ good: statusOf(d) === 'mature', warn: statusOf(d) === 'suspended' }"
        >
          {{ STATUS_LABEL[statusOf(d)] }}
        </span>
        <button
          v-if="statusOf(d) !== 'mature'"
          type="button"
          class="ghost"
          @click="act(d)"
        >
          {{ statusOf(d) === 'new' ? '加入' : statusOf(d) === 'suspended' ? '恢复' : '暂停' }}
        </button>
      </li>
    </ul>

    <div v-if="filtered.length > shown" class="center">
      <button type="button" @click="shown += PAGE">显示更多（剩 {{ filtered.length - shown }} 个）</button>
    </div>
    <p class="muted small center">共 {{ filtered.length }} 个词。点词条看详情，暂停的词不会进每日队列。</p>
  </div>
</template>

<style scoped>
.back {
  text-decoration: none;
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
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
}

.link {
  color: inherit;
  text-decoration: none;
  min-width: 0;
}

.name {
  font-weight: 600;
  margin-right: 8px;
}
</style>
