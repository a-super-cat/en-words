<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { useRoute } from 'vue-router';
import SpeakButton from '../components/SpeakButton.vue';
import { decompose, formatParts } from '../lib/morphology';
import { getWordNote } from '../lib/wordNotes';
import { useApp } from '../stores/app';
import { useVocab } from '../stores/vocab';
import { useWords } from '../stores/words';
import { loadDictionary, type Dictionary } from '../vocab/dictionary';
import { etymUrl, findExamples, wordStatus, type WordStatus } from '../vocab/words';

const route = useRoute();
const app = useApp();
const vocab = useVocab();
const words = useWords();
const dict = shallowRef<Dictionary | null>(null);
onMounted(async () => (dict.value = await loadDictionary()));

const word = computed(() => String(route.params.word ?? '').toLowerCase());
const dw = computed(() => dict.value?.resolve(word.value));
const card = computed(() => words.cards.get(word.value));
const status = computed<WordStatus>(() => wordStatus(card.value));
const inNotebook = computed(() => vocab.notebook.some((e) => e.term.toLowerCase() === word.value));
const note = computed(() => getWordNote(word.value));
const morphology = computed(() => {
  const parts = decompose(word.value);
  return parts ? formatParts(parts) : null;
});
const examples = computed(() => findExamples(word.value, app.entries, 3));
const etym = computed(() => etymUrl(word.value));

const STATUS_LABEL: Record<WordStatus, string> = {
  new: '还没学',
  learning: '学习中',
  mature: '已掌握',
  suspended: '已暂停',
};

const confirmingReset = ref(false);

async function toggleSuspend() {
  await words.setSuspended(word.value, status.value !== 'suspended');
}

async function reset() {
  if (!confirmingReset.value) {
    confirmingReset.value = true;
    return;
  }
  confirmingReset.value = false;
  await words.removeCard(word.value);
}
</script>

<template>
  <div class="stack has-actionbar">
    <div class="row between">
      <RouterLink to="/words" class="muted small back">‹ 单词</RouterLink>
      <span class="badge" :class="{ good: status === 'mature', warn: status === 'suspended' }">
        {{ STATUS_LABEL[status] }}
      </span>
    </div>

    <p v-if="dict && !dw" class="notice bad">词典里没有这个词：{{ word }}</p>

    <section v-else class="panel stack">
      <div class="row between">
        <span class="word">{{ word }}</span>
        <SpeakButton :text="word" />
      </div>
      <p v-if="dw?.phonetic" class="muted">/{{ dw.phonetic }}/<span v-if="dw?.rank"> · 词频第 {{ dw.rank }} 名</span></p>
      <div v-if="dw?.zh" class="zh">{{ dw.zh }}</div>
      <p v-if="dw?.en" class="muted">{{ dw.en }}</p>
      <p v-if="morphology" class="small">构词：{{ morphology }}</p>
      <p v-if="inNotebook" class="small"><span class="badge accent">生词本</span></p>

      <blockquote v-for="(ex, i) in examples" :key="i" class="example">
        <p>{{ ex.en }}</p>
        <p v-if="ex.zh" class="muted small">{{ ex.zh }}</p>
      </blockquote>

      <div v-if="note" class="stack note">
        <p class="small">词源：{{ note.etymology }}</p>
        <p v-if="note.collocations.length > 0" class="small muted">搭配：{{ note.collocations.join('；') }}</p>
        <p v-if="note.example" class="small muted">{{ note.example.en }}（{{ note.example.zh }}）</p>
      </div>

      <p class="small">
        <a :href="etym" target="_blank" rel="noopener">在 Etymonline 查这个词的词源 ↗</a>
        ·
        <RouterLink :to="{ path: '/words', query: { q: word } }">在词库里看相关词条</RouterLink>
      </p>
    </section>

    <div v-if="dw" class="actionbar">
      <button v-if="status === 'new'" type="button" class="primary" @click="words.enqueue(word)">
        <span>加入学习</span>
      </button>
      <template v-else>
        <button v-if="status === 'suspended'" type="button" class="primary" @click="toggleSuspend">
          <span>恢复学习</span>
        </button>
        <button v-else type="button" @click="toggleSuspend">
          <span>暂停</span>
        </button>
        <button type="button" class="danger" @click="reset">
          <span>{{ confirmingReset ? '确认重置进度？' : '重置进度' }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.back {
  text-decoration: none;
}

.word {
  font-size: 1.9rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.zh {
  font-size: 1.1rem;
  font-weight: 600;
}

.example {
  margin: 0;
  padding: 10px 14px;
  border-left: 3px solid var(--accent);
  background: var(--accent-soft);
  border-radius: 0 8px 8px 0;
}

.example p {
  margin: 0;
}

.note {
  gap: 4px;
}
</style>
