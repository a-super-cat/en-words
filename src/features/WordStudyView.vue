<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import SpeakButton from '../components/SpeakButton.vue';
import { decompose, formatParts } from '../lib/morphology';
import { speak } from '../lib/tts';
import { getWordNote } from '../lib/wordNotes';
import { useApp } from '../stores/app';
import { useVocab } from '../stores/vocab';
import { useWords } from '../stores/words';
import type { Rating, WordCardState } from '../types';
import { loadDictionary, type Dictionary, type DictWord } from '../vocab/dictionary';
import {
  buildWordQueue,
  etymUrl,
  findExample,
  introducedToday,
  newWordCard,
  previewWordDays,
} from '../vocab/words';

interface Item {
  word: string;
  kind: 'due' | 'notebook' | 'new';
}

/** 上一次评分的快照，撤销时把卡恢复到评分前（新词第一次评分就删卡） */
interface GradeSnapshot {
  item: Item;
  prev: WordCardState | null;
  requeued: boolean;
  fresh: boolean;
  forgot: boolean;
}

const app = useApp();
const vocab = useVocab();
const words = useWords();
const dict = shallowRef<Dictionary | null>(null);

const items = ref<Item[]>([]);
const index = ref(0);
const revealed = ref(false);
const busy = ref(false);
const redone = new Set<string>();
const stats = ref({ total: 0, fresh: 0, forgot: 0 });
const ready = ref(false);
const lastGrade = ref<GradeSnapshot | null>(null);

onMounted(async () => {
  const d = await loadDictionary();
  dict.value = d;
  const now = Date.now();
  const q = buildWordQueue({
    cards: words.all,
    notebookWords: vocab.notebook.map((e) => e.term),
    ranked: d.ranked,
    marks: vocab.marks,
    knownRank: app.settings.knownRank,
    newLimit: app.settings.newWordsPerDay - introducedToday(words.all, now),
    now,
  });
  items.value = [
    ...q.due.map((c) => ({ word: c.word, kind: 'due' as const })),
    ...q.fresh.map((f) => ({ word: f.word, kind: f.fromNotebook ? ('notebook' as const) : ('new' as const) })),
  ];
  ready.value = true;
  const first = items.value[0];
  if (first && app.settings.autoSpeak) speak(first.word, app.settings);
});

const current = computed(() => items.value[index.value] ?? null);
const done = computed(() => ready.value && index.value >= items.value.length);

const detail = computed(() => {
  const item = current.value;
  const d = dict.value;
  if (!item || !d) return null;
  const dw: DictWord | undefined = d.resolve(item.word);
  const parts = decompose(item.word);
  return {
    dw,
    morphology: parts ? formatParts(parts) : null,
    note: getWordNote(item.word),
    example: findExample(item.word, app.entries),
    etym: etymUrl(item.word),
  };
});

const previews = computed(() => {
  const item = current.value;
  if (!item) return null;
  const card = words.cards.get(item.word) ?? newWordCard(item.word, Date.now());
  return previewWordDays(card, Date.now());
});

const KIND_LABEL: Record<Item['kind'], string> = { due: '复习', notebook: '生词本', new: '新词' };
const RATINGS: { rating: Rating; label: string; cls: string }[] = [
  { rating: 1, label: '忘了', cls: 'danger' },
  { rating: 2, label: '困难', cls: '' },
  { rating: 3, label: '记得', cls: 'primary' },
  { rating: 4, label: '很熟', cls: '' },
];

// 新卡出现时按设置自动朗读一次，学单词先过耳朵。撤销回退时不触发（要停在已翻面的状态）
let skipWatch = false;
watch(index, () => {
  if (skipWatch) {
    skipWatch = false;
    return;
  }
  revealed.value = false;
  const item = current.value;
  if (item && app.settings.autoSpeak) speak(item.word, app.settings);
});

async function grade(rating: Rating) {
  const item = current.value;
  if (!item || busy.value) return;
  busy.value = true;
  try {
    const before = words.cards.get(item.word);
    const prev = before ? { ...before } : null;
    await words.grade(item.word, rating);
    let requeued = false;
    if (rating === 1 && !redone.has(item.word)) {
      // 忘了的词在本轮末尾再出现一次，趁热再记一遍（只重排一次）
      redone.add(item.word);
      items.value = [...items.value, item];
      requeued = true;
    }
    lastGrade.value = {
      item,
      prev,
      requeued,
      fresh: item.kind !== 'due',
      forgot: rating === 1,
    };
    stats.value.total++;
    if (item.kind !== 'due') stats.value.fresh++;
    if (rating === 1) stats.value.forgot++;
    index.value++;
  } finally {
    busy.value = false;
  }
}

async function undo() {
  const g = lastGrade.value;
  if (!g || busy.value) return;
  busy.value = true;
  try {
    if (g.prev) await words.upsert(g.prev);
    else await words.removeCard(g.item.word);
    if (g.requeued) {
      const arr = items.value;
      if (arr.length > 0 && arr[arr.length - 1] === g.item) items.value = arr.slice(0, -1);
      redone.delete(g.item.word);
    }
    stats.value.total--;
    if (g.fresh) stats.value.fresh--;
    if (g.forgot) stats.value.forgot--;
    skipWatch = true;
    index.value--;
    revealed.value = true;
    lastGrade.value = null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="stack has-actionbar">
    <div class="row between">
      <RouterLink to="/words" class="muted small back">‹ 单词</RouterLink>
      <span class="row">
        <span v-if="items.length > 0 && !done" class="muted small">{{ Math.min(index + 1, items.length) }} / {{ items.length }}</span>
        <button type="button" class="ghost" :disabled="!lastGrade || busy" @click="undo">撤销</button>
      </span>
    </div>
    <div v-if="items.length > 0 && !done" class="bar"><span :style="{ width: `${(index / items.length) * 100}%` }"></span></div>

    <p v-if="!ready" class="muted">正在准备今天的单词…</p>

    <template v-else-if="done">
      <section class="panel stack center">
        <h2>{{ stats.total > 0 ? '这一轮学完了' : '今天没有要学的单词' }}</h2>
        <p v-if="stats.total > 0" class="muted">
          共评 {{ stats.total }} 次 · 新词 {{ stats.fresh }} 个 · 忘了 {{ stats.forgot }} 次（已在本轮重排）
        </p>
        <div><RouterLink to="/words" class="btn primary">回到单词页</RouterLink></div>
      </section>
    </template>

    <template v-else-if="current && detail">
      <section class="panel stack word-card">
        <div class="row between">
          <span class="badge">{{ KIND_LABEL[current.kind] }}</span>
          <SpeakButton :text="current.word" />
        </div>
        <div class="word">{{ current.word }}</div>
        <p v-if="detail.dw?.phonetic" class="muted center">/{{ detail.dw.phonetic }}/</p>

        <template v-if="revealed">
          <div class="zh">{{ detail.dw?.zh || '（词典里暂无中文释义）' }}</div>
          <p v-if="detail.dw?.en" class="muted">{{ detail.dw.en }}</p>
          <p v-if="detail.morphology" class="small">构词：{{ detail.morphology }}</p>
          <blockquote v-if="detail.example" class="example">
            <p>{{ detail.example.en }}</p>
            <p class="muted small">{{ detail.example.zh }}</p>
          </blockquote>
          <div v-if="detail.note" class="note stack">
            <p class="small">词源：{{ detail.note.etymology }}</p>
            <p v-if="detail.note.example" class="small muted">{{ detail.note.example.en }}（{{ detail.note.example.zh }}）</p>
          </div>
          <p class="small">
            <a :href="detail.etym" target="_blank" rel="noopener">在 Etymonline 查这个词的词源 ↗</a>
          </p>
        </template>
        <p v-else class="muted center small">先回忆一下它的意思，再看答案</p>
      </section>
    </template>

    <div v-if="ready && !done && current" class="actionbar">
      <button v-if="!revealed" type="button" class="primary big" @click="revealed = true">显示释义</button>
      <template v-else>
        <button
          v-for="r in RATINGS"
          :key="r.rating"
          type="button"
          :class="r.cls"
          :disabled="busy"
          @click="grade(r.rating)"
        >
          {{ r.label }}
          <span v-if="previews" class="days">{{ previews[r.rating] }} 天</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.back {
  text-decoration: none;
}

.bar {
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  overflow: hidden;
}

.bar span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}

.word-card {
  padding: 20px 18px;
}

.word {
  font-size: 2rem;
  font-weight: 700;
  text-align: center;
  overflow-wrap: anywhere;
}

.zh {
  font-size: 1.15rem;
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

.actionbar button.big {
  font-size: 1.05rem;
}

.actionbar .days {
  font-size: 0.72rem;
  opacity: 0.75;
}
</style>
