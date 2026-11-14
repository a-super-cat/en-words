<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { useApp } from '../stores/app';
import { useVocab } from '../stores/vocab';
import { useWords } from '../stores/words';
import { loadDictionary, type Dictionary } from '../vocab/dictionary';
import { wordStatus, type WordStatus } from '../vocab/words';

const app = useApp();
const vocab = useVocab();
const words = useWords();
const dict = shallowRef<Dictionary | null>(null);
onMounted(async () => (dict.value = await loadDictionary()));

/** 正在等二次确认的移除目标（点一次变确认，避免误删） */
const confirming = ref<string | null>(null);

const STATUS_LABEL: Record<WordStatus, string> = {
  new: '待学',
  learning: '学习中',
  mature: '已掌握',
  suspended: '已暂停',
};

const rows = computed(() =>
  vocab.notebook.map((e) => {
    const key = e.term.toLowerCase();
    const dw = dict.value?.resolve(e.term);
    return {
      entry: e,
      key,
      zh: dw?.zh || e.zh,
      phonetic: dw?.phonetic ?? '',
      status: wordStatus(words.cards.get(key)),
    };
  }),
);

async function toggleSuspend(row: (typeof rows.value)[number]) {
  await words.setSuspended(row.key, row.status !== 'suspended');
}

async function remove(row: (typeof rows.value)[number]) {
  if (confirming.value !== row.entry.id) {
    confirming.value = row.entry.id;
    return;
  }
  confirming.value = null;
  await words.removeCard(row.key);
  await app.deleteUserEntry(row.entry.id);
}
</script>

<template>
  <div class="stack">
    <div class="row between">
      <RouterLink to="/words" class="muted small back">‹ 单词</RouterLink>
      <span class="muted small">共 {{ rows.length }} 个</span>
    </div>
    <h1>生词本</h1>
    <p class="muted small">
      从测评、筛查和阅读里收进来的词，在单词线里按遗忘曲线学，不再混进词条的复习。暂停的词不会出现在每日队列里。
    </p>

    <p v-if="rows.length === 0" class="muted">生词本还是空的。读文章时点生词、或在单词页做筛查，就能把词收进来。</p>

    <ul class="list">
      <li v-for="row in rows" :key="row.entry.id" class="item">
        <span class="grow">
          <span class="name">{{ row.entry.term }}</span>
          <span class="muted small">
            <template v-if="row.phonetic">/{{ row.phonetic }}/ · </template>{{ row.zh }}
          </span>
        </span>
        <span class="badge" :class="{ good: row.status === 'mature', warn: row.status === 'suspended' }">
          {{ STATUS_LABEL[row.status] }}
        </span>
        <button v-if="row.status === 'learning' || row.status === 'mature'" type="button" class="ghost" @click="toggleSuspend(row)">
          暂停
        </button>
        <button v-if="row.status === 'suspended'" type="button" class="ghost" @click="toggleSuspend(row)">恢复</button>
        <button type="button" class="ghost danger-text" @click="remove(row)">
          {{ confirming === row.entry.id ? '确认移除？' : '移除' }}
        </button>
      </li>
    </ul>
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

.name {
  font-weight: 600;
  margin-right: 8px;
}

.danger-text {
  color: var(--bad);
}
</style>
