<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useRoute } from 'vue-router';
import EntryFacts from '../components/EntryFacts.vue';
import { dropFocus, useHotkeys } from '../lib/keys';
import { speak, stopSpeaking } from '../lib/tts';
import { GROUP_SIZE, shuffle } from '../srs/queue';
import { useApp, type LearnOutcome } from '../stores/app';
import type { Entry } from '../types';

const app = useApp();
const route = useRoute();

type Phase = 'study' | 'test' | 'done';

const groups = shallowRef<Entry[][]>([]);
const groupIndex = ref(0);
const phase = ref<Phase>('study');
const studyIndex = ref(0);
const known = ref(new Set<string>());
const missed = ref(new Set<string>());
const testQueue = shallowRef<Entry[]>([]);
const revealed = ref(false);
const learned = ref(0);
const saving = ref(false);
/** 这一组从开始到学完的用时，结束时写进新学日志，计入统计页的学习时长 */
const groupStart = ref(0);

const group = computed(() => groups.value[groupIndex.value] ?? []);
const current = computed(() => (phase.value === 'study' ? group.value[studyIndex.value] : testQueue.value[0]));

const say = (text: string) => app.settings.autoSpeak && speak(text, app.settings);

function startGroup() {
  groupStart.value = Date.now();
  phase.value = 'study';
  studyIndex.value = 0;
  known.value = new Set();
  missed.value = new Set();
  revealed.value = false;
  dropFocus();
  if (group.value[0]) say(group.value[0].term);
}

onMounted(() => {
  app.tick();
  groups.value = app.pickNew(route.query.extra === '1' ? GROUP_SIZE : app.newRemaining);
  if (groups.value.length === 0) phase.value = 'done';
  else startGroup();
});
onBeforeUnmount(stopSpeaking);

function nextStudy(markKnown: boolean) {
  if (phase.value !== 'study' || !current.value) return;
  if (markKnown) known.value.add(current.value.id);
  dropFocus();
  if (studyIndex.value < group.value.length - 1) {
    studyIndex.value++;
    say(current.value.term);
    return;
  }
  // 这一组看完了：马上考一轮，自称已经会了的不考
  testQueue.value = shuffle(group.value.filter((e) => !known.value.has(e.id)));
  revealed.value = false;
  phase.value = 'test';
  if (testQueue.value.length === 0) void finishGroup();
}

function reveal() {
  if (phase.value !== 'test' || revealed.value || !current.value) return;
  revealed.value = true;
  say(current.value.term);
}

function answer(correct: boolean) {
  if (phase.value !== 'test' || !revealed.value || !current.value) return;
  const [head, ...rest] = testQueue.value;
  if (!correct) missed.value.add(head.id);
  // 说错的排到最后再考，直到说对为止
  testQueue.value = correct ? rest : [...rest, head];
  revealed.value = false;
  dropFocus();
  if (testQueue.value.length === 0) void finishGroup();
}

async function finishGroup() {
  if (saving.value) return;
  saving.value = true;
  const outcome = (e: Entry): LearnOutcome =>
    known.value.has(e.id) ? 'known' : missed.value.has(e.id) ? 'retry' : 'pass';
  await app.learnGroup(group.value.map((entry) => ({ entry, outcome: outcome(entry) })), Date.now() - groupStart.value);
  learned.value += group.value.length;
  saving.value = false;
  if (groupIndex.value < groups.value.length - 1) {
    groupIndex.value++;
    startGroup();
  } else {
    phase.value = 'done';
    stopSpeaking();
  }
}

useHotkeys((key, e) => {
  if (phase.value === 'study') {
    if (key === 'Space' || key === 'enter') (e.preventDefault(), nextStudy(false));
    else if (key === 'k') nextStudy(true);
  } else if (phase.value === 'test') {
    if (key === 'Space' || key === 'enter') (e.preventDefault(), reveal());
    else if (key === '1') answer(false);
    else if (key === '2') answer(true);
  }
});
</script>

<template>
  <div class="stack" :class="{ 'has-actionbar': phase !== 'done' }">
    <div class="row between">
      <RouterLink to="/" class="btn ghost">← 退出</RouterLink>
      <span v-if="phase !== 'done'" class="muted small">
        第 {{ groupIndex + 1 }} / {{ groups.length }} 组 ·
        {{ phase === 'study' ? `学习 ${studyIndex + 1} / ${group.length}` : `小测 还剩 ${testQueue.length} 条` }}
      </span>
    </div>

    <section v-if="phase === 'study' && current" class="panel stack">
      <span class="muted small">{{ app.categoryTitle.get(current.category) }} · 听一遍，跟读一遍</span>
      <EntryFacts :entry="current" show-situation />
    </section>

    <section v-else-if="phase === 'test' && current" class="panel stack">
      <!-- D 层是只需要读懂的书面词，小测考“看到英文想起意思”；其余考“看到中文说出英文” -->
      <span class="muted small">{{ current.layer === 'D' ? '回想这个词的意思' : '用英文说出这个表达' }}</span>
      <p class="big">{{ current.layer === 'D' ? current.term : current.zh }}</p>
      <template v-if="revealed">
        <hr />
        <EntryFacts :entry="current" compact />
      </template>
    </section>

    <!-- 学习和自测的推进按钮固定在底部 -->
    <div v-if="phase === 'study' && current" class="actionbar">
      <button type="button" class="primary" @click="nextStudy(false)">
        <span>{{ studyIndex < group.length - 1 ? '下一条' : '开始小测' }} <kbd>空格</kbd></span>
      </button>
      <button type="button" @click="nextStudy(true)">
        <span>已经会了 <kbd>K</kbd></span>
      </button>
    </div>
    <div v-else-if="phase === 'test' && current" class="actionbar">
      <template v-if="revealed">
        <button type="button" class="danger" @click="answer(false)">
          <span>{{ current.layer === 'D' ? '没想起来' : '没说对' }} <kbd>1</kbd></span>
        </button>
        <button type="button" class="primary" @click="answer(true)">
          <span>{{ current.layer === 'D' ? '想起来了' : '说对了' }} <kbd>2</kbd></span>
        </button>
      </template>
      <button v-else type="button" class="primary" @click="reveal">
        <span>看答案 <kbd>空格</kbd></span>
      </button>
    </div>

    <section v-else-if="phase === 'done'" class="panel stack center">
      <template v-if="learned > 0">
        <h2>今天学了 {{ learned }} 条新内容</h2>
        <p class="muted">它们会在接下来几天出现在复习里，先考中译英。</p>
      </template>
      <template v-else>
        <h2>没有可学的新内容</h2>
        <p class="muted">词库里开放的分类都学过了，可以在设置里打开更多分类，或者到词库里添加自己的词条。</p>
      </template>
      <div><RouterLink to="/" class="btn primary">回到今日</RouterLink></div>
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
</style>
