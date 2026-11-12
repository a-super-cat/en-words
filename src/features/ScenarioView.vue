<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ChunkList from '../components/ChunkList.vue';
import SpeakButton from '../components/SpeakButton.vue';
import { dropFocus, useHotkeys } from '../lib/keys';
import { speak, stopSpeaking, ttsSupported } from '../lib/tts';
import { useApp } from '../stores/app';
import { useSpeaking } from '../stores/speaking';

const app = useApp();
const speaking = useSpeaking();
const route = useRoute();
const router = useRouter();

const scenario = speaking.scenarioById.get(String(route.params.id));
const turns = scenario?.turns ?? [];
const myTurns = turns.filter((t) => t.speaker === 'me').length;

const index = ref(0);
/** 对方的轮次：是否显示原文。你的轮次：是否显示参考说法。 */
const revealed = ref(false);
const said = ref(0);
const done = ref(false);
const current = ref<HTMLElement | null>(null);

const turn = computed(() => turns[index.value]);
// 已经说过的对话。练完后包含最后一句，方便回头重听。
const past = computed(() => (done.value ? turns : turns.slice(0, index.value)));

const say = (text: string) => speak(text, app.settings);

async function enter() {
  const t = turn.value;
  if (!t) return;
  // 对方的话先只听不看；浏览器不能朗读时直接显示原文
  revealed.value = t.speaker === 'them' && !ttsSupported;
  if (t.speaker === 'them') say(t.en);
  dropFocus();
  await nextTick();
  current.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

onMounted(enter);
onBeforeUnmount(stopSpeaking);

async function next() {
  if (index.value < turns.length - 1) {
    index.value++;
    return enter();
  }
  stopSpeaking();
  done.value = true;
  if (scenario) {
    await speaking.saveRun({ id: String(Date.now()), scenarioId: scenario.id, at: Date.now(), said: said.value, total: myTurns });
  }
}

function reveal() {
  const t = turn.value;
  if (!t || revealed.value) return;
  revealed.value = true;
  if (t.speaker === 'me' && app.settings.autoSpeak) say(t.en);
}

function judge(ok: boolean) {
  if (turn.value?.speaker !== 'me' || !revealed.value) return;
  if (ok) said.value++;
  void next();
}

function another() {
  const s = speaking.nextScenario(undefined, scenario?.id);
  if (s) void router.push(`/scenarios/${s.id}`);
}

useHotkeys((key, e) => {
  const t = turn.value;
  if (done.value || !t) return;
  if (key === 'Space' || key === 'enter') {
    e.preventDefault();
    if (t.speaker === 'them') void next();
    else reveal();
  } else if (key === 'r') {
    if (t.speaker === 'them' || revealed.value) say(t.en);
  } else if (key === 't' && t.speaker === 'them') {
    reveal();
  } else if (t.speaker === 'me' && revealed.value && (key === '1' || key === '2')) {
    judge(key === '2');
  }
});
</script>

<template>
  <div class="stack">
    <div class="row between">
      <RouterLink to="/scenarios" class="btn ghost">← 场景</RouterLink>
      <span v-if="scenario && !done" class="muted small">{{ index + 1 }} / {{ turns.length }}</span>
    </div>

    <p v-if="!scenario" class="notice bad">没有找到这个场景。</p>

    <template v-else>
      <section class="panel stack">
        <h1>{{ scenario.title }}</h1>
        <p class="muted">{{ scenario.setting }}</p>
      </section>

      <ol v-if="past.length > 0" class="log">
        <li v-for="(t, i) in past" :key="i" :class="t.speaker">
          <span class="who">{{ t.speaker === 'me' ? '你' : t.name }}</span>
          <span class="grow">{{ t.en }}</span>
          <SpeakButton :text="t.en" />
        </li>
      </ol>

      <section v-if="!done && turn" ref="current" class="panel stack">
        <template v-if="turn.speaker === 'them'">
          <div class="row">
            <span class="badge">{{ turn.name }}</span>
            <span class="muted small">先听，听不清再看原文</span>
          </div>
          <template v-if="revealed">
            <p class="line">{{ turn.en }}</p>
            <p class="muted small">{{ turn.zh }}</p>
          </template>
          <div class="row">
            <button type="button" class="primary" @click="next">
              {{ index < turns.length - 1 ? '下一句' : '结束' }} <kbd>空格</kbd>
            </button>
            <button v-if="ttsSupported" type="button" @click="say(turn.en)">再听一遍 <kbd>R</kbd></button>
            <button v-if="!revealed" type="button" @click="reveal">看原文 <kbd>T</kbd></button>
          </div>
        </template>

        <template v-else>
          <div class="row">
            <span class="badge accent">轮到你</span>
            <span class="muted small">用英文把这个意思说出来</span>
          </div>
          <p class="line">{{ turn.zh }}</p>
          <div v-if="!revealed">
            <button type="button" class="primary" @click="reveal">说完了，看参考说法 <kbd>空格</kbd></button>
          </div>
          <template v-else>
            <hr />
            <div class="muted small">参考说法（意思到了就算对，不必逐字相同）</div>
            <div class="row tight">
              <p class="line grow">{{ turn.en }}</p>
              <SpeakButton :text="turn.en" />
            </div>
            <ChunkList :chunks="turn.chunks" layer="B" />
            <div class="row">
              <button type="button" class="danger" @click="judge(false)">没说出来 <kbd>1</kbd></button>
              <button type="button" class="primary" @click="judge(true)">说出来了 <kbd>2</kbd></button>
            </div>
          </template>
        </template>
      </section>

      <section v-if="done" class="panel stack center">
        <h2>这个场景练完了</h2>
        <p>{{ myTurns }} 轮里说出来了 {{ said }} 轮</p>
        <p class="muted small">没说出来的那几句，回到上面再听一遍参考说法，把里面的表达加入复习。</p>
        <div class="row" style="justify-content: center">
          <button type="button" class="primary" @click="another">再来一个</button>
          <RouterLink to="/" class="btn">回到今日</RouterLink>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.log {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.log li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 0.95rem;
}

.log li.me {
  background: var(--accent-soft);
  border-color: transparent;
}

.who {
  flex: none;
  min-width: 3.5em;
  font-weight: 600;
  color: var(--muted);
}

.line {
  font-size: 1.2rem;
  line-height: 1.5;
}

.tight {
  flex-wrap: nowrap;
  align-items: flex-start;
  gap: 4px;
}

hr {
  width: 100%;
  border: none;
  border-top: 1px solid var(--border);
  margin: 0;
}
</style>
