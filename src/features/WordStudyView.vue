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
  buildWordSession,
  etymUrl,
  findExample,
  introducedToday,
  makeCloze,
  newWordCard,
  previewWordDays,
  type WordSessionItem,
} from '../vocab/words';

/** 上一次评分的快照，撤销时把卡恢复到评分前（新词第一次评分就删卡） */
interface GradeSnapshot {
  item: WordSessionItem;
  prev: WordCardState | null;
  requeued: boolean;
  /** “本来就会”跳过测试时被摘掉的 test 项，撤销时要放回去 */
  removedTest: WordSessionItem | null;
  forgot: boolean;
}

type Format = 'card' | 'cloze' | 'zh2en';

const app = useApp();
const vocab = useVocab();
const words = useWords();
const dict = shallowRef<Dictionary | null>(null);

const items = ref<WordSessionItem[]>([]);
const index = ref(0);
const revealed = ref(false);
const busy = ref(false);
const redone = new Set<string>();
const stats = ref({ introduced: 0, graded: 0, forgot: 0 });
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
    studying: vocab.studied.studying,
    mastered: vocab.studied.mastered,
  });
  items.value = buildWordSession(q.due, q.fresh);
  ready.value = true;
  const first = items.value[0];
  if (first && app.settings.autoSpeak && !wouldLeak(first)) speak(first.word, app.settings);
});

/** 中译英题型先念单词等于直接报答案，这种情况下不自动朗读 */
function wouldLeak(item: WordSessionItem): boolean {
  return item.mode === 'test' && current.value === item && format.value === 'zh2en';
}

const current = computed(() => items.value[index.value] ?? null);
const done = computed(() => ready.value && index.value >= items.value.length);
const isIntro = computed(() => current.value?.mode === 'intro');

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

// 考的时候随机换题型：认读、例句挖空、中译英轮着来，避免只记住“这张卡”。
// 用词本身和位置算一个稳定散列，同一项在重渲染时不会跳来跳去。
const format = computed<Format>(() => {
  const item = current.value;
  if (!item || item.mode === 'intro' || !detail.value) return 'card';
  const options: Format[] = ['card'];
  const ex = detail.value.example;
  if (ex && makeCloze(item.word, ex.en)) options.push('cloze');
  if (detail.value.dw?.zh) options.push('zh2en');
  const h = [...item.word].reduce((a, c) => a + c.charCodeAt(0), 0) + index.value;
  return options[h % options.length];
});

const cloze = computed(() => {
  const item = current.value;
  const ex = detail.value?.example;
  if (!item || format.value !== 'cloze' || !ex) return null;
  return makeCloze(item.word, ex.en);
});

const previews = computed(() => {
  const item = current.value;
  if (!item || item.mode === 'intro') return null;
  const card = words.cards.get(item.word) ?? newWordCard(item.word, Date.now());
  return previewWordDays(card, Date.now());
});

const KIND_LABEL: Record<WordSessionItem['kind'], string> = {
  due: '复习',
  notebook: '生词本',
  new: '新词',
};
const FORMAT_LABEL: Record<Format, string> = { card: '认读', cloze: '例句挖空', zh2en: '中译英' };
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
  if (item && app.settings.autoSpeak && !wouldLeak(item)) speak(item.word, app.settings);
});

/** intro 看完，记住了：不打分，本轮后段会再考一次 */
function advanceIntro() {
  if (!isIntro.value) return;
  stats.value.introduced++;
  lastGrade.value = null;
  index.value++;
}

/** intro 时就确定会：直接按“很熟”建卡，并把后面排着的 test 项摘掉 */
async function skipTest() {
  const item = current.value;
  if (!item || item.mode !== 'intro' || busy.value) return;
  busy.value = true;
  try {
    const before = words.cards.get(item.word);
    const prev = before ? { ...before } : null;
    await words.grade(item.word, 4);
    let removedTest: WordSessionItem | null = null;
    const ti = items.value.findIndex((x, i) => i > index.value && x.word === item.word && x.mode === 'test');
    if (ti >= 0) {
      removedTest = items.value[ti];
      items.value = items.value.filter((_, i) => i !== ti);
    }
    lastGrade.value = { item, prev, requeued: false, removedTest, forgot: false };
    stats.value.introduced++;
    stats.value.graded++;
    index.value++;
  } finally {
    busy.value = false;
  }
}

async function grade(rating: Rating) {
  const item = current.value;
  if (!item || item.mode === 'intro' || busy.value) return;
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
      removedTest: null,
      forgot: rating === 1,
    };
    stats.value.graded++;
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
    if (g.removedTest) items.value = [...items.value, g.removedTest];
    stats.value.graded--;
    if (g.item.mode === 'intro') stats.value.introduced--;
    if (g.forgot) stats.value.forgot--;
    skipWatch = true;
    index.value--;
    revealed.value = g.item.mode === 'test';
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
        <h2>{{ stats.graded > 0 || stats.introduced > 0 ? '这一轮学完了' : '今天没有要学的单词' }}</h2>
        <p v-if="stats.graded > 0 || stats.introduced > 0" class="muted">
          新学 {{ stats.introduced }} 个 · 共评分 {{ stats.graded }} 次 · 忘了 {{ stats.forgot }} 次（已在本轮重排）
        </p>
        <div><RouterLink to="/words" class="btn primary">回到单词页</RouterLink></div>
      </section>
    </template>

    <!-- 先学：新词完整呈现，例句在前，先建立印象，不打分 -->
    <template v-else-if="current && detail && isIntro">
      <section class="panel stack word-card">
        <div class="row between">
          <span class="badge accent">{{ KIND_LABEL[current.kind] }} · 先学</span>
          <SpeakButton :text="current.word" />
        </div>
        <div class="word">{{ current.word }}</div>
        <p v-if="detail.dw?.phonetic" class="muted center">/{{ detail.dw.phonetic }}/</p>
        <blockquote v-if="detail.example" class="example">
          <p>{{ detail.example.en }}</p>
          <p class="muted small">{{ detail.example.zh }}</p>
        </blockquote>
        <div class="zh">{{ detail.dw?.zh || '（词典里暂无中文释义）' }}</div>
        <p v-if="detail.dw?.en" class="muted">{{ detail.dw.en }}</p>
        <p v-if="detail.morphology" class="small">构词：{{ detail.morphology }}</p>
        <div v-if="detail.note" class="note stack">
          <p class="small">词源：{{ detail.note.etymology }}</p>
          <p v-if="detail.note.example" class="small muted">{{ detail.note.example.en }}（{{ detail.note.example.zh }}）</p>
        </div>
        <p class="small">
          <a :href="detail.etym" target="_blank" rel="noopener">在 Etymonline 查这个词的词源 ↗</a>
        </p>
        <p class="muted small center">看完记住它，本轮后面还会再考你一次。</p>
      </section>
    </template>

    <!-- 考：认读 / 例句挖空 / 中译英，先回忆再看答案评分 -->
    <template v-else-if="current && detail">
      <section class="panel stack word-card">
        <div class="row between">
          <span class="badge">{{ KIND_LABEL[current.kind] }} · {{ FORMAT_LABEL[format] }}</span>
          <SpeakButton v-if="format !== 'zh2en' || revealed" :text="current.word" />
        </div>

        <template v-if="format === 'cloze' && cloze">
          <p class="cloze">{{ revealed && detail.example ? detail.example.en : cloze }}</p>
          <p class="muted center small">空里应该填哪个词？先在心里说出它和它的意思</p>
        </template>
        <template v-else-if="format === 'zh2en'">
          <div class="zh center big-zh">{{ detail.dw?.zh }}</div>
          <p class="muted center small">说出这个英文单词</p>
        </template>
        <template v-else>
          <div class="word">{{ current.word }}</div>
          <p v-if="detail.dw?.phonetic" class="muted center">/{{ detail.dw.phonetic }}/</p>
        </template>

        <template v-if="revealed">
          <div v-if="format !== 'card'" class="word small-word">{{ current.word }}</div>
          <p v-if="format === 'cloze' && detail.example" class="muted center small">{{ detail.example.zh }}</p>
          <div class="zh">{{ detail.dw?.zh || '（词典里暂无中文释义）' }}</div>
          <p v-if="detail.dw?.en" class="muted">{{ detail.dw.en }}</p>
          <p v-if="detail.morphology" class="small">构词：{{ detail.morphology }}</p>
          <blockquote v-if="detail.example && format !== 'cloze'" class="example">
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
        <p v-else class="muted center small">先回忆一下，再看答案</p>
      </section>
    </template>

    <div v-if="ready && !done && current" class="actionbar">
      <template v-if="isIntro">
        <button type="button" :disabled="busy" @click="skipTest">
          <span>本来就会</span>
        </button>
        <button type="button" class="primary" @click="advanceIntro">
          <span>记住了，下一个</span>
        </button>
      </template>
      <button v-else-if="!revealed" type="button" class="primary big" @click="revealed = true">
        <span>显示答案</span>
      </button>
      <template v-else>
        <button
          v-for="r in RATINGS"
          :key="r.rating"
          type="button"
          :class="r.cls"
          :disabled="busy"
          @click="grade(r.rating)"
        >
          <span>{{ r.label }}</span>
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

.small-word {
  font-size: 1.4rem;
}

.big-zh {
  text-align: center;
  font-size: 1.3rem;
  margin: 12px 0;
}

.cloze {
  font-size: 1.15rem;
  line-height: 1.6;
  text-align: center;
  margin: 12px 0;
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
