<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import EntryFacts from '../components/EntryFacts.vue';
import Highlight from '../components/Highlight.vue';
import SpeakButton from '../components/SpeakButton.vue';
import { dropFocus, useHotkeys } from '../lib/keys';
import { speak, stopSpeaking, ttsSupported } from '../lib/tts';
import { buildPrompt, type Prompt, type PromptMode } from '../srs/prompt';
import { previewDays } from '../srs/schedule';
import { useApp, type UndoToken } from '../stores/app';
import type { Entry, Rating } from '../types';

/** redo：本轮忘记的条目在最后再过一遍，只练不计分 */
interface Item {
  key: string;
  redo: boolean;
}

interface View {
  item: Item;
  entry: Entry;
  prompt: Prompt;
  days: Record<Rating, number>;
}

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

const app = useApp();

const items = ref<Item[]>([]);
const index = ref(0);
const view = shallowRef<View | null>(null);
const revealed = ref(false);
const paused = ref(false);
const done = ref(false);
const busy = ref(false);
const clock = ref(Date.now());
const shownAt = ref(Date.now());
const revealMs = ref(0);
const stats = reactive({ rated: 0, forgot: 0, activeMs: 0 });
const leeches = ref<Entry[]>([]);
const last = shallowRef<{ token: UndoToken; items: Item[]; index: number; rating: Rating } | null>(null);
let capWarned = false;

const timer = setInterval(() => (clock.value = Date.now()), 100);
onBeforeUnmount(() => {
  clearInterval(timer);
  stopSpeaking();
});

const total = computed(() => items.value.length);
const isProduce = computed(() => (view.value?.prompt.limitSec ?? 0) > 0);
const limitMs = computed(() => (view.value?.prompt.limitSec ?? 0) * 1000);
const countdown = computed(() => Math.max(0, 1 - (clock.value - shownAt.value) / limitMs.value));
const overtime = computed(() => isProduce.value && revealMs.value > limitMs.value);
const minutes = computed(() => Math.max(1, Math.round(stats.activeMs / 60_000)));

const fmtDays = (d: number) => (d < 30 ? `${d} 天` : `${Math.round(d / 30)} 个月`);
const say = (text: string) => speak(text, app.settings);

function show() {
  // 跳过已经不该出题的条目：被暂停的、内容已被删除的
  for (; index.value < items.value.length; index.value++) {
    const item = items.value[index.value];
    const card = app.cards.get(item.key);
    const entry = card && app.byId.get(card.entryId);
    if (!card || !entry || (card.suspended && !item.redo)) continue;

    const prompt = buildPrompt(card, entry, app.notes.get(entry.id), ttsSupported);
    view.value = { item, entry, prompt, days: previewDays(card, Date.now()) };
    revealed.value = false;
    revealMs.value = 0;
    shownAt.value = clock.value = Date.now();
    dropFocus();
    if (prompt.mode === 'listen' || (prompt.mode === 'recognize' && app.settings.autoSpeak)) say(entry.term);
    return;
  }
  view.value = null;
  done.value = true;
  stopSpeaking();
}

onMounted(() => {
  items.value = app.reviewQueue().map((key) => ({ key, redo: false }));
  show();
});

function reveal() {
  if (!view.value || revealed.value || paused.value) return;
  revealed.value = true;
  revealMs.value = Date.now() - shownAt.value;
  if (isProduce.value && app.settings.autoSpeak) say(view.value.prompt.speak);
}

async function rate(rating: Rating) {
  const v = view.value;
  if (!v || !revealed.value || busy.value || paused.value) return;
  const spent = Date.now() - shownAt.value;
  stats.activeMs += Math.min(spent, 60_000);

  if (v.item.redo) {
    if (rating === 1) items.value.push({ key: v.item.key, redo: true });
    index.value++;
    return show();
  }

  busy.value = true;
  const before = { items: [...items.value], index: index.value };
  const token = await app.rate(v.item.key, rating, spent, v.prompt.stage);
  busy.value = false;
  if (token) {
    last.value = { token, ...before, rating };
    stats.rated++;
    if (rating === 1) stats.forgot++;
    // 说得出就算认得：同一条的识别卡已经自动带过，从后面的队列里拿掉
    items.value = items.value.filter((it, i) => i <= index.value || !token.autoKeys.includes(it.key));
    if (token.becameLeech) leeches.value.push(v.entry);
    else if (rating === 1) items.value.push({ key: v.item.key, redo: true });
  }
  index.value++;

  const left = items.value.slice(index.value).filter((it) => !it.redo).length;
  if (!capWarned && left > 0 && stats.activeMs >= app.settings.reviewMinutes * 60_000) {
    capWarned = true;
    paused.value = true;
    stopSpeaking();
    return;
  }
  show();
}

async function undo() {
  const l = last.value;
  if (!l || busy.value) return;
  busy.value = true;
  await app.undo(l.token);
  busy.value = false;
  items.value = l.items;
  index.value = l.index;
  stats.rated--;
  if (l.rating === 1) stats.forgot--;
  if (l.token.becameLeech) leeches.value.pop();
  last.value = null;
  paused.value = false;
  done.value = false;
  show();
}

function resume() {
  paused.value = false;
  show();
}

function finish() {
  paused.value = false;
  view.value = null;
  done.value = true;
}

function replay() {
  const v = view.value;
  if (v) say(revealed.value && isProduce.value ? v.prompt.speak : v.entry.term);
}

useHotkeys((key, e) => {
  if (done.value || paused.value || !view.value) {
    if (key === 'z') void undo();
    return;
  }
  if (key === 'Space' || key === 'enter') {
    e.preventDefault();
    reveal();
  } else if (key === 'z') {
    void undo();
  } else if (key === 'r') {
    if (revealed.value || !isProduce.value) replay();
  } else if (revealed.value && /^[1-4]$/.test(key)) {
    const rating = Number(key) as Rating;
    if (!view.value.item.redo || rating <= 2) void rate(view.value.item.redo && rating === 2 ? 3 : rating);
  }
});
</script>

<template>
  <div class="stack has-actionbar">
    <div class="row between">
      <RouterLink to="/" class="btn ghost">← 退出</RouterLink>
      <div class="row">
        <span v-if="!done" class="muted small">{{ Math.min(index + 1, total) }} / {{ total }}</span>
        <button type="button" class="ghost" :disabled="!last || busy" @click="undo">撤销 <kbd>Z</kbd></button>
      </div>
    </div>
    <div v-if="!done" class="bar"><span :style="{ width: `${(index / Math.max(1, total)) * 100}%` }" /></div>

    <section v-if="paused" class="panel stack center">
      <h2>已经复习了 {{ app.settings.reviewMinutes }} 分钟</h2>
      <p class="muted">剩下的会顺延到明天，不会丢。也可以继续做完。</p>
      <div class="row" style="justify-content: center">
        <button type="button" class="primary" @click="finish">今天到这里</button>
        <button type="button" @click="resume">继续复习</button>
      </div>
    </section>

    <section v-else-if="view" class="panel stack">
      <div class="row">
        <span class="badge accent">{{ MODE_LABEL[view.prompt.mode] }}</span>
        <span v-if="view.item.redo" class="badge warn">再练一遍</span>
        <span class="muted small">{{ app.categoryTitle.get(view.entry.category) }}</span>
      </div>
      <p class="muted">{{ view.prompt.instruction }}</p>

      <div v-if="view.prompt.mode === 'listen'">
        <button type="button" @click="replay">再听一遍 <kbd>R</kbd></button>
      </div>
      <p v-else class="big">{{ view.prompt.question }}</p>
      <p v-if="view.prompt.context && !revealed" class="muted">{{ view.prompt.context }}</p>
      <p v-if="view.prompt.target" class="small"><span class="muted">要用上：</span>{{ view.prompt.target }}</p>

      <template v-if="!revealed">
        <div v-if="isProduce" class="bar" :class="{ over: countdown === 0 }">
          <span :style="{ width: countdown === 0 ? '100%' : `${countdown * 100}%` }" />
        </div>
        <p class="muted small">想好之后，点底部按钮看答案。</p>
      </template>

      <template v-else>
        <hr />
        <div v-if="view.prompt.mode === 'sentence' || view.prompt.mode === 'situation'" class="answer">
          <div class="muted small">参考说法</div>
          <div class="row tight">
            <span class="grow"><Highlight :text="view.prompt.answer" :term="view.entry.term" /></span>
            <SpeakButton :text="view.prompt.answer" />
          </div>
        </div>
        <EntryFacts :entry="view.entry" compact />

        <p v-if="overtime && !view.item.redo" class="notice">
          想了 {{ (revealMs / 1000).toFixed(1) }} 秒，超过了 {{ view.prompt.limitSec }} 秒。说对了也建议评“困难”。
        </p>
      </template>
    </section>

    <!-- 主要操作固定在底部拇指区：看答案、评分都不用够着屏幕中间 -->
    <div v-if="view && !paused" class="actionbar">
      <button v-if="!revealed" type="button" class="primary" @click="reveal">
        <span>{{ isProduce ? '说完了，看答案' : '看答案' }} <kbd>空格</kbd></span>
      </button>
      <template v-else-if="view.item.redo">
        <button type="button" class="danger" :disabled="busy" @click="rate(1)">
          <span>没说对 <kbd>1</kbd></span>
        </button>
        <button type="button" class="primary" :disabled="busy" @click="rate(3)">
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
          @click="rate(r.rating)"
        >
          <span>{{ r.label }} <kbd>{{ r.rating }}</kbd></span>
          <span class="muted small">{{ fmtDays(view.days[r.rating]) }}后</span>
        </button>
      </template>
    </div>

    <section v-else-if="done" class="panel stack center">
      <template v-if="stats.rated > 0">
        <h2>复习完成</h2>
        <p>复习 {{ stats.rated }} 张 · 忘了 {{ stats.forgot }} 张 · 用时约 {{ minutes }} 分钟</p>
      </template>
      <template v-else>
        <h2>今天没有到期的复习</h2>
      </template>

      <div v-if="leeches.length > 0" class="notice" style="text-align: left">
        下面这些反复忘记，已经暂停。到词库里给它写一句关于自己经历的句子，再恢复复习：
        <ul>
          <li v-for="e in leeches" :key="e.id">
            <RouterLink :to="{ path: '/library', query: { q: e.term } }">{{ e.term }}</RouterLink>
          </li>
        </ul>
      </div>

      <div class="row" style="justify-content: center">
        <RouterLink to="/" class="btn primary">回到今日</RouterLink>
        <RouterLink v-if="app.newRemaining > 0" to="/learn" class="btn">学新内容</RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
hr {
  width: 100%;
  border: none;
  border-top: 1px solid var(--border);
  margin: 0;
}

.answer {
  font-size: 1.15rem;
}

.tight {
  gap: 4px;
  flex-wrap: nowrap;
  align-items: flex-start;
}

.bar > span {
  transition: width 0.1s linear;
}

.notice ul {
  margin: 6px 0 0;
  padding-left: 20px;
}
</style>
