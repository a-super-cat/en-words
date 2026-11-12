<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useRoute } from 'vue-router';
import SpeakButton from '../components/SpeakButton.vue';
import { dropFocus, useHotkeys } from '../lib/keys';
import { decompose, formatParts } from '../lib/morphology';
import { speak, stopSpeaking } from '../lib/tts';
import { useApp } from '../stores/app';
import { useVocab } from '../stores/vocab';
import {
  PER_BAND,
  bandRange,
  bandWords,
  estimate,
  sampleBand,
  shouldStop,
  type BandResult,
  type Estimate,
} from '../vocab/assess';
import { loadDictionary, type Dictionary, type DictWord } from '../vocab/dictionary';

/**
 * 两种用法共用一个页面：
 * - 测评（/vocab/assess）：每个频段抽 10 个词，回答“认识”后要看释义确认，结果用来估计词汇量。
 * - 筛查（/vocab/triage/:band）：把一个频段里没筛过的词逐个过一遍，不认识的直接收进生词本。
 */
const TRIAGE_BATCH = 50;

const app = useApp();
const vocab = useVocab();
const route = useRoute();

const triageBand = route.params.band ? Number(route.params.band) : null;
const isAssess = triageBand === null;

const dict = shallowRef<Dictionary | null>(null);
const queue = shallowRef<DictWord[]>([]);
const index = ref(0);
/** ask：等回答。reveal：显示释义，测评里用来确认是不是真的认识。 */
const phase = ref<'ask' | 'reveal'>('ask');
const saidKnown = ref(false);
const done = ref(false);
const busy = ref(false);

// 测评
const band = ref(1);
const bandKnown = ref(0);
const results = ref<BandResult[]>([]);
const result = shallowRef<Estimate | null>(null);
const missed = shallowRef<DictWord[]>([]);
const collected = ref<number | null>(null);

// 筛查
const tally = ref({ known: 0, added: 0 });
const left = ref(0);

const current = computed(() => queue.value[index.value]);
/** 构词拆解（词根词缀），翻面看释义时一起给，帮着记 */
const currentMorph = computed(() => {
  const w = current.value;
  if (!w || !dict.value) return null;
  const d = dict.value;
  const parts = decompose(w.word, {
    isWord: (stem) => d.resolve(stem) !== undefined,
    glossOf: (stem) => d.resolve(stem)?.zh,
  });
  return parts ? formatParts(parts) : null;
});
const range = computed(() => bandRange(triageBand ?? band.value));

const say = (w: DictWord) => app.settings.autoSpeak && speak(w.word, app.settings);

function loadTriage(d: Dictionary) {
  // 没筛过的：既没有标记，也不在复习里
  const { studying, mastered } = vocab.model;
  const pending = bandWords(d.ranked, triageBand!).filter((w) => {
    const key = w.word.toLowerCase();
    return !vocab.marks.has(key) && !studying.has(key) && !mastered.has(key);
  });
  left.value = pending.length;
  queue.value = pending.slice(0, TRIAGE_BATCH);
}

function begin() {
  index.value = 0;
  phase.value = 'ask';
  done.value = queue.value.length === 0;
  dropFocus();
  if (current.value) say(current.value);
}

onMounted(async () => {
  const d = (dict.value = await loadDictionary());
  if (isAssess) queue.value = sampleBand(d.ranked, 1);
  else loadTriage(d);
  begin();
});
onBeforeUnmount(stopSpeaking);

async function answer(known: boolean) {
  const w = current.value;
  if (!w || phase.value !== 'ask' || busy.value) return;
  saidKnown.value = known;
  if (isAssess) {
    phase.value = 'reveal';
    return;
  }
  busy.value = true;
  if (known) {
    await vocab.setMark(w.word, 'known');
    tally.value.known++;
    busy.value = false;
    return next();
  }
  tally.value.added += await vocab.collect([{ word: w }]);
  busy.value = false;
  phase.value = 'reveal';
}

/** 测评里看完释义后的确认：really 为 false 表示“以为认识，其实记错了” */
async function confirm(really: boolean) {
  const w = current.value;
  if (!w || phase.value !== 'reveal' || busy.value) return;
  if (isAssess) {
    const known = saidKnown.value && really;
    busy.value = true;
    await vocab.setMark(w.word, known ? 'known' : 'unknown');
    busy.value = false;
    if (known) bandKnown.value++;
    else missed.value = [...missed.value, w];
  }
  await next();
}

async function next() {
  phase.value = 'ask';
  dropFocus();
  if (index.value < queue.value.length - 1) {
    index.value++;
    say(current.value);
    return;
  }
  if (!isAssess) {
    left.value -= queue.value.length;
    done.value = true;
    return;
  }
  results.value.push({ band: band.value, known: bandKnown.value, total: queue.value.length });
  if (shouldStop(results.value)) return finishAssessment();
  band.value++;
  bandKnown.value = 0;
  queue.value = sampleBand(dict.value!.ranked, band.value);
  index.value = 0;
  say(current.value);
}

async function finishAssessment() {
  const e = (result.value = estimate(results.value));
  done.value = true;
  stopSpeaking();
  // results 里是响应式代理对象，存进 IndexedDB 之前要复制成普通对象
  await vocab.saveAssessment({ id: String(Date.now()), at: Date.now(), bands: results.value.map((r) => ({ ...r })), ...e });
}

async function collectMissed() {
  collected.value = await vocab.collect(missed.value.map((word) => ({ word })));
}

function more() {
  loadTriage(dict.value!);
  begin();
}

useHotkeys((key, e) => {
  if (done.value || !current.value) return;
  if (phase.value === 'ask') {
    if (key === '1') void answer(false);
    else if (key === '2') void answer(true);
  } else if (key === 'Space' || key === 'enter' || key === '2') {
    e.preventDefault();
    void confirm(true);
  } else if (key === '1' && isAssess && saidKnown.value) {
    void confirm(false);
  }
});
</script>

<template>
  <div class="stack">
    <div class="row between">
      <RouterLink to="/vocab" class="btn ghost">← 词汇</RouterLink>
      <span v-if="!done && current" class="muted small">
        {{ isAssess ? '测评' : '筛查' }} · 词频 {{ range[0] }}–{{ range[1] }} · {{ index + 1 }} / {{ queue.length }}
      </span>
    </div>

    <p v-if="!dict" class="muted center">正在加载词典…</p>

    <section v-else-if="!done && current" class="panel stack">
      <div class="row">
        <span class="big">{{ current.word }}</span>
        <SpeakButton :text="current.word" />
        <span v-if="current.phonetic" class="muted">/{{ current.phonetic }}/</span>
      </div>

      <template v-if="phase === 'ask'">
        <p class="muted small">
          {{ isAssess ? '能说出它的一个意思才算认识，眼熟不算。' : '认识的直接跳过；不认识的会收进生词本。' }}
        </p>
        <div class="row">
          <button type="button" class="danger" :disabled="busy" @click="answer(false)">不认识 <kbd>1</kbd></button>
          <button type="button" class="primary" :disabled="busy" @click="answer(true)">认识 <kbd>2</kbd></button>
        </div>
      </template>

      <template v-else>
        <p class="gloss">{{ current.zh }}</p>
        <p v-if="current.en" class="muted small">{{ current.en }}</p>
        <p v-if="currentMorph" class="muted small">构词：{{ currentMorph }}</p>
        <p v-if="!isAssess" class="muted small">已收进生词本。</p>
        <div class="row">
          <button v-if="isAssess && saidKnown" type="button" class="danger" :disabled="busy" @click="confirm(false)">
            其实记错了 <kbd>1</kbd>
          </button>
          <button type="button" class="primary" :disabled="busy" @click="confirm(true)">
            {{ isAssess && saidKnown ? '没错' : '下一个' }} <kbd>空格</kbd>
          </button>
        </div>
      </template>
    </section>

    <section v-else-if="done && isAssess && result" class="panel stack">
      <h2>测评结果</h2>
      <div class="num">约 {{ result.size.toLocaleString() }} 词</div>
      <p class="muted small">
        这是按抽样估计的认读词汇量，每段只抽了 {{ PER_BAND }} 个词，误差在几百词上下。阅读助手现在默认你认识最常用的前
        {{ result.knownRank.toLocaleString() }} 个词。
      </p>
      <table>
        <thead>
          <tr>
            <th>词频范围</th>
            <th>认识的比例</th>
            <th class="n">认识</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in results" :key="r.band">
            <td>{{ bandRange(r.band)[0] }}–{{ bandRange(r.band)[1] }}</td>
            <td class="wide"><div class="bar"><span :style="{ width: `${(r.known / r.total) * 100}%` }" /></div></td>
            <td class="n">{{ r.known }} / {{ r.total }}</td>
          </tr>
        </tbody>
      </table>
      <template v-if="missed.length > 0">
        <p class="small">
          <span class="muted">这次不认识的 {{ missed.length }} 个词：</span>{{ missed.map((w) => w.word).join('、') }}
        </p>
        <div class="row">
          <button v-if="collected === null" type="button" @click="collectMissed">把它们收进生词本</button>
          <span v-else class="muted small">已收进 {{ collected }} 个。</span>
        </div>
      </template>
      <div><RouterLink to="/vocab" class="btn primary">回到词汇</RouterLink></div>
    </section>

    <section v-else-if="done" class="panel stack center">
      <template v-if="queue.length > 0">
        <h2>这一批筛完了</h2>
        <p>认识 {{ tally.known }} 个 · 收进生词本 {{ tally.added }} 个</p>
      </template>
      <h2 v-else>这一段已经全部筛过了</h2>
      <div class="row" style="justify-content: center">
        <button v-if="left > 0" type="button" class="primary" @click="more">再筛 {{ Math.min(TRIAGE_BATCH, left) }} 个</button>
        <RouterLink to="/vocab" class="btn">回到词汇</RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.gloss {
  font-size: 1.15rem;
}

.wide {
  width: 50%;
}
</style>
