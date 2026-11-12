<script setup lang="ts">
import { reactive, ref } from 'vue';
import SpeakButton from '../components/SpeakButton.vue';
import { useSpeaking } from '../stores/speaking';
import type { Story } from '../types';

type Part = 'situation' | 'task' | 'action' | 'result';

const PARTS: { key: Part; label: string; hint: string; starters: string[] }[] = [
  {
    key: 'situation',
    label: 'S 背景',
    hint: '一两句话交代背景：什么团队、什么系统、当时的情况。',
    starters: ['In my previous role at ..., we were ...', 'The context was that ...'],
  },
  {
    key: 'task',
    label: 'T 任务',
    hint: '你要解决什么问题，你的职责是什么。',
    starters: ['I was responsible for ...', 'My goal was to ...'],
  },
  {
    key: 'action',
    label: 'A 行动',
    hint: '你具体做了什么、为什么这么做。这是重点，占一半篇幅。用 I，不用 we。',
    starters: ['The first thing I did was ...', 'I decided to ... because ...'],
  },
  {
    key: 'result',
    label: 'R 结果',
    hint: '结果是什么，最好有数字。再加一句学到了什么。',
    starters: ['As a result, ...', 'This reduced ... by ...', 'Looking back, I learned that ...'],
  },
];

const speaking = useSpeaking();

const blank = (): Story => ({ id: '', title: '', situation: '', task: '', action: '', result: '', updatedAt: 0 });
const draft = reactive<Story>(blank());
const editing = ref(false);
const openId = ref<string | null>(null);

const fullText = (s: Story) => [s.situation, s.task, s.action, s.result].filter(Boolean).join(' ');

function edit(story?: Story) {
  Object.assign(draft, story ?? blank());
  editing.value = true;
}

async function save() {
  await speaking.saveStory({ ...draft, id: draft.id || String(Date.now()), title: draft.title.trim(), updatedAt: Date.now() });
  editing.value = false;
}

async function remove(story: Story) {
  if (confirm(`删除故事“${story.title}”？`)) await speaking.deleteStory(story.id);
}
</script>

<template>
  <div class="stack">
    <div class="row between">
      <RouterLink to="/speak" class="btn ghost">← 题库</RouterLink>
      <button v-if="!editing" type="button" class="primary" @click="edit()">写一个新故事</button>
    </div>
    <h1>我的 STAR 故事</h1>
    <p class="muted">
      行为题问来问去就是那几类：冲突、失败、赶工期、带人、技术决策、线上事故。准备五六个真实经历，用英文按 STAR
      写成提纲，一个故事可以应对好几道题。写提纲就够了，不要写成逐字稿去背。
    </p>

    <form v-if="editing" class="panel stack" @submit.prevent="save">
      <label class="field">
        标题（给自己看的，例如“支付系统迁移”）
        <input v-model="draft.title" type="text" required />
      </label>
      <label v-for="p in PARTS" :key="p.key" class="field">
        {{ p.label }}：{{ p.hint }}
        <textarea v-model="draft[p.key]" rows="3" :placeholder="p.starters.join('\n')" />
      </label>
      <div class="row">
        <button type="submit" class="primary">保存</button>
        <button type="button" @click="editing = false">取消</button>
      </div>
    </form>

    <p v-if="speaking.stories.length === 0 && !editing" class="muted">还没有故事。</p>

    <section v-for="s in speaking.stories" :key="s.id" class="panel stack">
      <div class="row between">
        <button type="button" class="ghost title" :aria-expanded="openId === s.id" @click="openId = openId === s.id ? null : s.id">
          {{ s.title }}
        </button>
        <div class="row">
          <SpeakButton :text="fullText(s)" />
          <button type="button" @click="edit(s)">修改</button>
          <button type="button" class="danger" @click="remove(s)">删除</button>
        </div>
      </div>
      <dl v-if="openId === s.id">
        <template v-for="p in PARTS" :key="p.key">
          <dt class="muted small">{{ p.label }}</dt>
          <dd>{{ s[p.key] || '（还没写）' }}</dd>
        </template>
      </dl>
    </section>
  </div>
</template>

<style scoped>
textarea,
input {
  width: 100%;
}

textarea {
  resize: vertical;
}

.title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text);
  padding-left: 0;
}

dl {
  margin: 0;
}

dd {
  margin: 0 0 10px;
  white-space: pre-wrap;
}
</style>
