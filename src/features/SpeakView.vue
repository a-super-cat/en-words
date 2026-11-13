<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AudioPlayer from '../components/AudioPlayer.vue';
import ChunkList from '../components/ChunkList.vue';
import SpeakButton from '../components/SpeakButton.vue';
import { dropFocus, useHotkeys } from '../lib/keys';
import { useRecorder } from '../lib/recorder';
import { speak, stopSpeaking } from '../lib/tts';
import { pickLearnedChunks, ROUND_SECONDS } from '../speaking/pick';
import { useApp } from '../stores/app';
import { useSpeaking } from '../stores/speaking';
import type { Attempt } from '../types';

type Phase = 'ready' | 'answering' | 'review' | 'done';

const FLUENCY = ['说不下去', '断断续续', '基本连贯', '比较流畅', '很流畅'];

const app = useApp();
const speaking = useSpeaking();
const route = useRoute();
const router = useRouter();
const recorder = useRecorder();

const question = speaking.questionById.get(String(route.params.id));
const history = question ? speaking.attemptsOf(question.id).slice().reverse() : [];
// 学过的相关表达：把复习里已经能说出的词块带进答题，练“自由运用”。没学过相关词块时为空，这一栏不出现。
const learnedChunks = computed(() => (question ? pickLearnedChunks(question, app.entries, app.cards) : []));
const ownTerms = new Set((question?.chunks ?? []).map((c) => c.term));
const ownUsed = (a: Attempt) => a.used.filter((t) => ownTerms.has(t)).length;
const learnedUsed = (a: Attempt) => a.used.length - ownUsed(a);
const isBehavioral = question?.category === 'behavioral' || question?.category === 'leadership';

const phase = ref<Phase>('ready');
const round = ref<1 | 2>(1);
const showZh = ref(false);
const startedAt = ref(0);
const clock = ref(Date.now());
const seconds = ref(0);
const audio = shallowRef<Blob | null>(null);
const used = ref<string[]>([]);
const fluency = ref(0);
const gaps = ref('');
const saving = ref(false);
const results = shallowRef<Attempt[]>([]);
const draft = reactive({ term: '', zh: '' });
const added = ref<string[]>([]);
const addError = ref('');

const limit = computed(() => ROUND_SECONDS[round.value]);
const remaining = computed(() => Math.max(0, limit.value - Math.floor((clock.value - startedAt.value) / 1000)));
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const fmtDate = (t: number) => new Date(t).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });

let timer: ReturnType<typeof setInterval> | undefined;
const stopTimer = () => {
  clearInterval(timer);
  timer = undefined;
};
// 像面试官提问一样，先把题目读出来
onMounted(() => {
  if (question && app.settings.autoSpeak) speak(question.prompt, app.settings);
});
onBeforeUnmount(() => {
  stopTimer();
  stopSpeaking();
});

async function start() {
  if (phase.value !== 'ready' || !question) return;
  stopSpeaking();
  dropFocus();
  // 拿不到麦克风也照常计时练习，只是没有回听
  await recorder.start();
  startedAt.value = clock.value = Date.now();
  phase.value = 'answering';
  timer = setInterval(() => {
    clock.value = Date.now();
    if (remaining.value === 0) void finishAnswer();
  }, 200);
}

async function finishAnswer() {
  if (phase.value !== 'answering') return;
  phase.value = 'review';
  stopTimer();
  seconds.value = Math.min(limit.value, Math.max(1, Math.round((Date.now() - startedAt.value) / 1000)));
  audio.value = await recorder.stop();
  dropFocus();
}

async function save(again: boolean) {
  if (!question || fluency.value === 0 || saving.value) return;
  saving.value = true;
  const attempt: Attempt = {
    id: `${Date.now()}-${round.value}`,
    questionId: question.id,
    at: Date.now(),
    round: round.value,
    seconds: seconds.value,
    limit: limit.value,
    used: [...used.value],
    fluency: fluency.value,
    gaps: gaps.value.trim(),
    audio: audio.value ?? undefined,
  };
  await speaking.saveAttempt(attempt);
  results.value = [...results.value, attempt];
  saving.value = false;

  if (again && round.value === 1) {
    round.value = 2;
    audio.value = null;
    used.value = [];
    fluency.value = 0;
    gaps.value = '';
    phase.value = 'ready';
  } else {
    phase.value = 'done';
  }
}

async function addGap() {
  addError.value = (await app.addChunk({ term: draft.term, zh: draft.zh }, 'C')) ?? '';
  if (addError.value) return;
  added.value.push(draft.term.trim());
  draft.term = '';
  draft.zh = '';
}

function another() {
  const next = speaking.nextQuestion(undefined, question?.id);
  if (next) void router.push(`/speak/${next.id}`);
}

useHotkeys((key, e) => {
  if (key !== 'Space' && key !== 'enter') return;
  if (phase.value === 'ready') (e.preventDefault(), void start());
  else if (phase.value === 'answering') (e.preventDefault(), void finishAnswer());
});
</script>

<template>
  <div class="stack">
    <div class="row between">
      <RouterLink to="/speak" class="btn ghost">← 题库</RouterLink>
      <span v-if="question && phase !== 'done'" class="muted small">
        第 {{ round }} 遍 · 限时 {{ fmt(limit) }}
      </span>
    </div>

    <p v-if="!question" class="notice bad">没有找到这道题。</p>

    <template v-else>
      <section class="panel stack">
        <div class="row tight">
          <p class="big grow">{{ question.prompt }}</p>
          <SpeakButton :text="question.prompt" />
        </div>
        <div>
          <button v-if="!showZh" type="button" class="ghost" @click="showZh = true">看中文</button>
          <p v-else class="muted">{{ question.zh }}</p>
        </div>

        <template v-if="phase === 'ready'">
          <div>
            <div class="muted small">尽量用上这些表达</div>
            <ChunkList :chunks="question.chunks" layer="C" />
          </div>
          <div v-if="learnedChunks.length > 0">
            <div class="muted small">你学过的相关表达，也试着用上</div>
            <ChunkList :chunks="learnedChunks" layer="C" />
          </div>
          <details v-if="round === 2" open>
            <summary class="muted small">回答提纲</summary>
            <ul class="outline">
              <li v-for="line in question.outline" :key="line">{{ line }}</li>
            </ul>
          </details>
          <p v-if="round === 2" class="notice">
            同一题再答一遍，这次限时 90 秒。把刚才卡住的地方补上，说得更紧凑。
          </p>
          <p v-else-if="isBehavioral" class="muted small">
            行为题用自己的真实经历回答。可以先看一眼
            <RouterLink to="/speak/stories">我的 STAR 故事</RouterLink>。
          </p>
          <div class="row">
            <button type="button" class="primary" @click="start">开始回答 <kbd>空格</kbd></button>
            <button v-if="round === 2" type="button" @click="phase = 'done'">不答了，结束</button>
          </div>
        </template>

        <template v-else-if="phase === 'answering'">
          <div class="timer" :class="{ low: remaining <= 15 }" role="timer">{{ fmt(remaining) }}</div>
          <p v-if="recorder.state.value === 'recording'" class="muted small center">正在录音</p>
          <p v-else class="notice">
            {{ recorder.state.value === 'denied' ? '没有麦克风权限' : '录音不可用' }}，这次只计时，不能回听。
          </p>
          <ChunkList :chunks="question.chunks" layer="C" hide-add />
          <ChunkList v-if="learnedChunks.length > 0" :chunks="learnedChunks" layer="C" hide-add />
          <div><button type="button" class="primary" @click="finishAnswer">说完了 <kbd>空格</kbd></button></div>
        </template>
      </section>

      <section v-if="phase === 'review'" class="panel stack">
        <h2>回听和自评 · 用时 {{ fmt(seconds) }}</h2>
        <AudioPlayer v-if="audio" :blob="audio" />

        <div>
          <div class="muted small">回答提纲（对照一下漏了什么）</div>
          <ul class="outline">
            <li v-for="line in question.outline" :key="line">{{ line }}</li>
          </ul>
        </div>

        <div>
          <div class="muted small">勾选这次用上的表达</div>
          <ChunkList v-model="used" :chunks="question.chunks" layer="C" />
        </div>

        <div v-if="learnedChunks.length > 0">
          <div class="muted small">学过的相关表达，用上了也可以勾</div>
          <ChunkList v-model="used" :chunks="learnedChunks" layer="C" />
        </div>

        <div>
          <div class="muted small">流利度</div>
          <div class="row">
            <button
              v-for="(label, i) in FLUENCY"
              :key="label"
              type="button"
              :class="{ primary: fluency === i + 1 }"
              :aria-pressed="fluency === i + 1"
              @click="fluency = i + 1"
            >
              {{ i + 1 }} {{ label }}
            </button>
          </div>
        </div>

        <label class="field">
          哪里卡住了（想说但没说出来的意思，写中文就行）
          <textarea v-model="gaps" rows="2" />
        </label>

        <form class="stack" @submit.prevent="addGap">
          <span class="muted small">查到了英文说法？记下来，明天起进入复习</span>
          <div class="row">
            <input v-model="draft.term" type="text" class="grow" placeholder="英文说法" required />
            <input v-model="draft.zh" type="text" class="grow" placeholder="中文提示" required />
            <button type="submit">加入复习</button>
          </div>
          <p v-if="addError" class="notice bad">{{ addError }}</p>
          <p v-if="added.length > 0" class="small muted">已加入：{{ added.join('、') }}</p>
        </form>

        <div v-if="question.followUps.length > 0">
          <div class="muted small">面试官可能接着问</div>
          <ul class="outline">
            <li v-for="f in question.followUps" :key="f">{{ f }}</li>
          </ul>
        </div>

        <p v-if="fluency === 0" class="muted small">先选一个流利度，再保存。</p>
        <div class="row">
          <button v-if="round === 1" type="button" class="primary" :disabled="fluency === 0 || saving" @click="save(true)">
            保存，再答一遍（90 秒）
          </button>
          <button type="button" :class="{ primary: round === 2 }" :disabled="fluency === 0 || saving" @click="save(false)">
            {{ round === 1 ? '保存并结束' : '保存' }}
          </button>
        </div>
      </section>

      <section v-if="phase === 'done'" class="panel stack">
        <h2>这道题练完了</h2>
        <table v-if="results.length > 0">
          <thead>
            <tr>
              <th>遍</th>
              <th class="n">用时</th>
              <th class="n">用上的表达</th>
              <th>流利度</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in results" :key="r.id">
              <td>第 {{ r.round }} 遍</td>
              <td class="n">{{ fmt(r.seconds) }}</td>
              <td class="n">
                {{ ownUsed(r) }} / {{ question.chunks.length
                }}<span v-if="learnedUsed(r) > 0" class="muted"> +{{ learnedUsed(r) }}</span>
              </td>
              <td>{{ r.fluency }} {{ FLUENCY[r.fluency - 1] }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="results.some((r) => learnedUsed(r) > 0)" class="muted small">
          “+数字”是题目自带表达之外，额外用上的你学过的表达。
        </p>
        <div class="row">
          <button type="button" class="primary" @click="another">再抽一题</button>
          <RouterLink to="/" class="btn">回到今日</RouterLink>
        </div>
      </section>

      <section v-if="phase === 'ready' && round === 1 && history.length > 0" class="panel stack">
        <h2>以前的练习</h2>
        <div v-for="a in history" :key="a.id" class="past">
          <div class="small">
            {{ fmtDate(a.at) }} · 第 {{ a.round }} 遍 · {{ fmt(a.seconds) }} · 用上 {{ a.used.length }} 个表达 · 流利度
            {{ a.fluency }}
          </div>
          <div v-if="a.gaps" class="small muted">卡住：{{ a.gaps }}</div>
          <AudioPlayer v-if="a.audio" :blob="a.audio" />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.tight {
  flex-wrap: nowrap;
  align-items: flex-start;
  gap: 4px;
}

.timer {
  font-size: 3.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
  line-height: 1.2;
}

.timer.low {
  color: var(--bad);
}

.outline {
  margin: 4px 0 0;
  padding-left: 20px;
}

textarea {
  width: 100%;
  resize: vertical;
}

.past + .past {
  border-top: 1px solid var(--border);
  padding-top: 10px;
}

.past {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
