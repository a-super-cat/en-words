<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import EntryFacts from '../components/EntryFacts.vue';
import Highlight from '../components/Highlight.vue';
import SpeakButton from '../components/SpeakButton.vue';
import { dropFocus, useHotkeys } from '../lib/keys';
import { speak, stopSpeaking, ttsSupported } from '../lib/tts';
import { buildMixedSession } from '../srs/mixed';
import { buildPrompt, type PromptMode } from '../srs/prompt';
import { isDue } from '../srs/queue';
import { previewDays } from '../srs/schedule';
import { useApp, type UndoToken } from '../stores/app';
import type { Direction, Entry, Rating } from '../types';

type RTItem =
  | { kind: 'review'; key: string; redo: boolean }
  | { kind: 'intro'; entry: Entry }
  | { kind: 'quiz'; entry: Entry; direction: Direction };

const MODE_LABEL: Record<PromptMode, string> = {
  cue: '提示回忆',
  sentence: '整句翻译',
  situation: '情境应答',
  recognize: '认读',
  listen: '听辨',
};
const RATINGS: { rating: Rating; label: string; cls: string }[] = [
  { rating: 1, label: '忘了', cls: 'again' },
  { rating: 2, label: '困难', cls: 'hard' },
  { rating: 3, label: '记得', cls: 'good' },
  { rating: 4, label: '很熟', cls: 'easy' },
];
const SIZES = [10, 20, 30];

const app = useApp();

const phase = ref<'setup' | 'session' | 'done'>('setup');
const size = ref(20);
const items = ref<RTItem[]>([]);
const index = ref(0);
const revealed = ref(false);
const busy = ref(false);
const stats = reactive({ reviewed: 0, forgot: 0, learned: 0, missed: 0 });
const leeches = ref<Entry[]>([]);
const quizResults = new Map<string, Partial<Record<Direction, boolean>>>();
const lastUndo = ref<{ token: UndoToken; items: RTItem[]; index: number; rating: Rating } | null>(null);
const shownAt = ref(Date.now());
const clock = ref(Date.now());
const revealMs = ref(0);

const timer = setInterval(() => (clock.value = Date.now()), 100);
onBeforeUnmount(() => {
  clearInterval(timer);
  stopSpeaking();
});

const dueTotal = computed(() => [...app.cards.values()].filter((c) => isDue(c, app.now)).length);
const nothingToDo = computed(() => dueTotal.value === 0 && app.newRemaining === 0);
const current = computed(() => items.value[index.value] ?? null);
const total = computed(() => items.value.length);
const introItem = computed(() => (current.value?.kind === 'intro' ? current.value : null));
const quizItem = computed(() => (current.value?.kind === 'quiz' ? current.value : null));

const reviewView = computed(() => {
  const it = current.value;
  if (!it || it.kind !== 'review') return null;
  const card = app.cards.get(it.key);
  const entry = card && app.byId.get(card.entryId);
  if (!card || !entry) return null;
  return {
    item: it,
    entry,
    prompt: buildPrompt(card, entry, app.notes.get(entry.id), ttsSupported),
    days: previewDays(card, Date.now()),
  };
});

const isProduceReview = computed(() => (reviewView.value?.prompt.limitSec ?? 0) > 0);
const limitMs = computed(() => (reviewView.value?.prompt.limitSec ?? 0) * 1000);
const countdown = computed(() => Math.max(0, 1 - (clock.value - shownAt.value) / limitMs.value));
const overtime = computed(() => isProduceReview.value && revealMs.value > limitMs.value);
const fmtDays = (d: number) => (d < 30 ? `${d} 天` : `${Math.round(d / 30)} 个月`);
const say = (text: string) => speak(text, app.settings);

function start() {
  app.tick();
  const plan = buildMixedSession({
    cards: app.cards.values(),
    newEntries: app.pickNew(app.newRemaining).flat(),
    size: size.value,
    now: Date.now(),
  });
  items.value = plan.items.map((x): RTItem => (x.kind === 'review' ? { ...x, redo: false } : x));
  index.value = 0;
  stats.reviewed = 0;
  stats.forgot = 0;
  stats.learned = 0;
  stats.missed = 0;
  leeches.value = [];
  quizResults.clear();
  lastUndo.value = null;
  phase.value = 'session';
  present();
}

/** 定位到当前题：跳过已失效的复习卡，按题型自动朗读，重置本题状态 */
function present() {
  revealed.value = false;
  revealMs.value = 0;
  for (; index.value < items.value.length; index.value++) {
    const it = items.value[index.value];
    if (it.kind === 'review' && !it.redo) {
      const card = app.cards.get(it.key);
      if (!card || card.suspended || !app.byId.has(card.entryId)) continue;
    }
    break;
  }
  if (index.value >= items.value.length) {
    phase.value = 'done';
    stopSpeaking();
    return;
  }
  shownAt.value = clock.value = Date.now();
  dropFocus();
  const it = items.value[index.value];
  if (it.kind === 'intro') {
    if (app.settings.autoSpeak) say(it.entry.term);
  } else if (it.kind === 'quiz') {
    if (it.direction === 'recognize' && app.settings.autoSpeak) say(it.entry.term);
  } else {
    const v = reviewView.value;
    if (v && (v.prompt.mode === 'listen' || (v.prompt.mode === 'recognize' && app.settings.autoSpeak))) {
      say(v.entry.term);
    }
  }
}

function advance() {
  index.value++;
  present();
}

function reveal() {
  if (revealed.value || phase.value !== 'session') return;
  revealed.value = true;
  revealMs.value = Date.now() - shownAt.value;
  const it = current.value;
  if (it?.kind === 'review' && isProduceReview.value && app.settings.autoSpeak && reviewView.value) {
    say(reviewView.value.prompt.speak);
  }
  if (it?.kind === 'quiz' && app.settings.autoSpeak) say(it.entry.term);
}

/** 学习卡看完。known=true 是自称已经会了：直接按满分建卡，并摘掉后面排着的测试卡 */
async function introDone(known: boolean) {
  const it = current.value;
  if (!it || it.kind !== 'intro' || busy.value) return;
  lastUndo.value = null;
  if (known) {
    busy.value = true;
    await app.learnEntry(it.entry, { recognize: 4, produce: 4 });
    busy.value = false;
    stats.learned++;
    items.value = items.value.filter(
      (x, i) => i <= index.value || !(x.kind === 'quiz' && x.entry === it.entry),
    );
  }
  advance();
}

/** 测试卡自评。两个方向都测完才建卡：对了按 3 起步，没对按 1 起步 */
async function quizAnswer(correct: boolean) {
  const it = current.value;
  if (!it || it.kind !== 'quiz' || !revealed.value || busy.value) return;
  lastUndo.value = null;
  const rec = quizResults.get(it.entry.id) ?? {};
  rec[it.direction] = correct;
  quizResults.set(it.entry.id, rec);
  if (!correct) stats.missed++;
  const needs: Direction[] = it.entry.layer === 'D' ? ['recognize'] : ['produce', 'recognize'];
  if (needs.every((d) => rec[d] !== undefined)) {
    busy.value = true;
    await app.learnEntry(it.entry, {
      recognize: rec.recognize ? 3 : 1,
      produce: it.entry.layer === 'D' ? undefined : rec.produce ? 3 : 1,
    });
    busy.value = false;
    stats.learned++;
  }
  advance();
}

async function reviewRate(rating: Rating) {
  const v = reviewView.value;
  if (!v || !revealed.value || busy.value) return;
  const spent = Date.now() - shownAt.value;

  if (v.item.redo) {
    // 再练一遍只练不计分，没对就排到最后继续练
    if (rating === 1) items.value = [...items.value, { kind: 'review', key: v.item.key, redo: true }];
    advance();
    return;
  }

  busy.value = true;
  const before = { items: [...items.value], index: index.value };
  const token = await app.rate(v.item.key, rating, spent, v.prompt.stage);
  busy.value = false;
  if (token) {
    lastUndo.value = { token, ...before, rating };
    stats.reviewed++;
    if (rating === 1) stats.forgot++;
    items.value = items.value.filter(
      (it, i) => i <= index.value || it.kind !== 'review' || !token.autoKeys.includes(it.key),
    );
    if (token.becameLeech) leeches.value.push(v.entry);
    else if (rating === 1) items.value = [...items.value, { kind: 'review', key: v.item.key, redo: true }];
  }
  advance();
}

async function undo() {
  const l = lastUndo.value;
  if (!l || busy.value) return;
  busy.value = true;
  await app.undo(l.token);
  busy.value = false;
  items.value = l.items;
  index.value = l.index;
  stats.reviewed--;
  if (l.rating === 1) stats.forgot--;
  if (l.token.becameLeech) leeches.value.pop();
  lastUndo.value = null;
  phase.value = 'session';
  present();
  revealed.value = true; // 撤销后停在已翻面状态，和复习页一致
}

function replay() {
  const v = reviewView.value;
  if (v) say(revealed.value && isProduceReview.value ? v.prompt.speak : v.entry.term);
}

useHotkeys((key, e) => {
  if (phase.value !== 'session') return;
  if (key === 'z') {
    void undo();
  } else if (key === 'Space' || key === 'enter') {
    e.preventDefault();
    const it = current.value;
    if (!it) return;
    if (it.kind === 'intro') void introDone(false);
    else if (!revealed.value) reveal();
  } else if (key === 'r') {
    if (current.value?.kind === 'review' && (revealed.value || !isProduceReview.value)) replay();
  } else if (revealed.value && /^[1-4]$/.test(key)) {
    const it = current.value;
    const n = Number(key);
    if (it?.kind === 'review') void reviewRate(n as Rating);
    else if (it?.kind === 'quiz' && n <= 2) void quizAnswer(n === 2);
  }
});
</script>

<template>
  <!-- 准备：看池子大小、选题量 -->
  <div v-if="phase === 'setup'" class="stack has-actionbar">
    <div class="row">
      <RouterLink to="/" class="muted small back">‹ 今日</RouterLink>
    </div>
    <section class="panel stack">
      <h2>随机混合练</h2>
      <p class="muted">
        一轮里又学新词条、又复习旧词条。复习按“快忘程度”加权随机抽——记得越不牢、逾期越久越容易被抽中；
        新词条先学后测，测试卡会隔几题再出现。
      </p>
      <p>
        到期复习 <strong>{{ dueTotal }}</strong> 张 · 今日可学新词条 <strong>{{ app.newRemaining }}</strong> 条
      </p>
      <div class="row">
        <span class="muted small">一轮题量</span>
        <button
          v-for="s in SIZES"
          :key="s"
          type="button"
          :class="{ primary: size === s }"
          @click="size = s"
        >
          {{ s }}
        </button>
      </div>
      <p v-if="nothingToDo" class="muted">今天没有到期的复习，新词条额度也学完了。</p>
    </section>
    <div class="actionbar">
      <button type="button" class="primary big" :disabled="nothingToDo" @click="start">
        <span>开始这一轮</span>
      </button>
    </div>
  </div>

  <!-- 进行中 -->
  <div v-else-if="phase === 'session'" class="stack has-actionbar">
    <div class="row between">
      <RouterLink to="/" class="btn ghost">← 退出</RouterLink>
      <div class="row">
        <span v-if="total > 0" class="muted small">{{ Math.min(index + 1, total) }} / {{ total }}</span>
        <button type="button" class="ghost" :disabled="!lastUndo || busy" @click="undo">撤销 <kbd>Z</kbd></button>
      </div>
    </div>
    <div class="bar"><span :style="{ width: `${(index / Math.max(1, total)) * 100}%` }" /></div>

    <!-- 复习题：与复习页同一套题面 -->
    <section v-if="current?.kind === 'review' && reviewView" class="panel stack">
      <div class="row">
        <span class="badge accent">复习 · {{ MODE_LABEL[reviewView.prompt.mode] }}</span>
        <span v-if="reviewView.item.redo" class="badge warn">再练一遍</span>
        <span class="muted small">{{ app.categoryTitle.get(reviewView.entry.category) }}</span>
      </div>
      <p class="muted">{{ reviewView.prompt.instruction }}</p>
      <div v-if="reviewView.prompt.mode === 'listen'">
        <button type="button" @click="replay">再听一遍 <kbd>R</kbd></button>
      </div>
      <p v-else class="big">{{ reviewView.prompt.question }}</p>
      <p v-if="reviewView.prompt.context && !revealed" class="muted">{{ reviewView.prompt.context }}</p>
      <p v-if="reviewView.prompt.target" class="small"><span class="muted">要用上：</span>{{ reviewView.prompt.target }}</p>

      <template v-if="!revealed">
        <div v-if="isProduceReview" class="bar" :class="{ over: countdown === 0 }">
          <span :style="{ width: countdown === 0 ? '100%' : `${countdown * 100}%` }" />
        </div>
        <p class="muted small">想好之后，点底部按钮看答案。</p>
      </template>
      <template v-else>
        <hr />
        <div v-if="reviewView.prompt.mode === 'sentence' || reviewView.prompt.mode === 'situation'" class="answer">
          <div class="muted small">参考说法</div>
          <div class="row tight">
            <span class="grow"><Highlight :text="reviewView.prompt.answer" :term="reviewView.entry.term" /></span>
            <SpeakButton :text="reviewView.prompt.answer" />
          </div>
        </div>
        <EntryFacts :entry="reviewView.entry" compact />
        <p v-if="overtime && !reviewView.item.redo" class="notice">
          想了 {{ (revealMs / 1000).toFixed(1) }} 秒，超过了 {{ reviewView.prompt.limitSec }} 秒。说对了也建议评“困难”。
        </p>
      </template>
    </section>

    <!-- 新词条学习卡：完整呈现，先建立印象 -->
    <section v-else-if="introItem" class="panel stack">
      <div class="row">
        <span class="badge accent">新词条 · 先学</span>
        <span class="muted small">{{ app.categoryTitle.get(introItem.entry.category) }}</span>
      </div>
      <EntryFacts :entry="introItem.entry" show-situation />
      <p class="muted small">看完记住它，本轮后面还会再考你。</p>
    </section>

    <!-- 新词条测试卡：按方向自评 -->
    <section v-else-if="quizItem" class="panel stack">
      <div class="row">
        <span class="badge accent">新词条 · 小测{{ quizItem.direction === 'produce' ? '（说）' : '（认）' }}</span>
        <span class="muted small">{{ app.categoryTitle.get(quizItem.entry.category) }}</span>
      </div>
      <template v-if="quizItem.direction === 'recognize'">
        <div class="row tight">
          <span class="big grow">{{ quizItem.entry.term }}</span>
          <SpeakButton :text="quizItem.entry.term" />
        </div>
        <p class="muted">回想这个表达的意思</p>
      </template>
      <template v-else>
        <p class="big">{{ quizItem.entry.zh }}</p>
        <p class="muted">说出这个英文表达</p>
        <p v-if="quizItem.entry.examples[0]" class="muted small">情境：{{ quizItem.entry.examples[0].zh }}</p>
      </template>
      <template v-if="revealed">
        <hr />
        <EntryFacts :entry="quizItem.entry" compact />
      </template>
      <p v-else class="muted small">想好之后，点底部按钮看答案。</p>
    </section>

    <div class="actionbar">
      <template v-if="current?.kind === 'intro'">
        <button type="button" :disabled="busy" @click="introDone(true)">
          <span>已经会了</span>
        </button>
        <button type="button" class="primary" :disabled="busy" @click="introDone(false)">
          <span>记住了，继续 <kbd>空格</kbd></span>
        </button>
      </template>
      <button v-else-if="!revealed" type="button" class="primary big" @click="reveal">
        <span>{{ current?.kind === 'review' && isProduceReview ? '说完了，看答案' : '看答案' }} <kbd>空格</kbd></span>
      </button>
      <template v-else-if="quizItem">
        <button type="button" class="danger" :disabled="busy" @click="quizAnswer(false)">
          <span>{{ quizItem.direction === 'produce' ? '没说对' : '没想起来' }} <kbd>1</kbd></span>
        </button>
        <button type="button" class="primary" :disabled="busy" @click="quizAnswer(true)">
          <span>{{ quizItem.direction === 'produce' ? '说对了' : '想起来了' }} <kbd>2</kbd></span>
        </button>
      </template>
      <template v-else-if="reviewView">
        <template v-if="reviewView.item.redo">
          <button type="button" class="danger" :disabled="busy" @click="reviewRate(1)">
            <span>没说对 <kbd>1</kbd></span>
          </button>
          <button type="button" class="primary" :disabled="busy" @click="reviewRate(3)">
            <span>说对了 <kbd>2</kbd></span>
          </button>
        </template>
        <template v-else>
          <button
            v-for="r in RATINGS"
            :key="r.rating"
            type="button"
            :class="[r.cls, { suggest: overtime && r.rating === 2 }]"
            :disabled="busy"
            @click="reviewRate(r.rating)"
          >
            <span>{{ r.label }} <kbd>{{ r.rating }}</kbd></span>
            <span class="muted small">{{ fmtDays(reviewView.days[r.rating]) }}后</span>
          </button>
        </template>
      </template>
    </div>
  </div>

  <!-- 结算 -->
  <div v-else class="stack">
    <section class="panel stack center">
      <h2>这一轮练完了</h2>
      <p class="muted">
        复习 {{ stats.reviewed }} 张（忘了 {{ stats.forgot }} 张）· 新学 {{ stats.learned }} 条（小测没对 {{ stats.missed }} 次）
      </p>
      <div v-if="leeches.length > 0" class="notice" style="text-align: left">
        下面这些反复忘记，已经暂停。到词库里给它写一句关于自己经历的句子，再恢复复习：
        <ul>
          <li v-for="e in leeches" :key="e.id">
            <RouterLink :to="{ path: '/words', query: { q: e.term } }">{{ e.term }}</RouterLink>
          </li>
        </ul>
      </div>
      <div class="row" style="justify-content: center">
        <RouterLink to="/" class="btn primary">回到今日</RouterLink>
        <button type="button" @click="phase = 'setup'">再来一轮</button>
      </div>
    </section>
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

.bar.over span {
  background: var(--bad);
}

.big {
  font-size: 1.35rem;
  font-weight: 600;
}

.actionbar button.big {
  font-size: 1.05rem;
}
</style>
