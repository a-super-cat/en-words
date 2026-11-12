<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { cardKey } from '../srs/schedule';
import { useApp } from '../stores/app';
import type { Direction, Entry } from '../types';
import EntryFacts from './EntryFacts.vue';

const props = defineProps<{ entry: Entry }>();
const app = useApp();

const LABEL: Record<Direction, string> = { produce: '中译英', recognize: '认读' };

const states = computed(() =>
  (['produce', 'recognize'] as const).flatMap((direction) => {
    const card = app.cards.get(cardKey(props.entry.id, direction));
    return card ? [{ direction, card }] : [];
  }),
);
const suspended = computed(() => states.value.some((s) => s.card.suspended));
const leech = computed(() => states.value.some((s) => s.card.leech));

const en = ref('');
const zh = ref('');
const saved = ref(false);
watch(
  () => props.entry.id,
  (id) => {
    const note = app.notes.get(id);
    en.value = note?.en ?? '';
    zh.value = note?.zh ?? '';
    saved.value = false;
  },
  { immediate: true },
);

const fmtDate = (t: number) => new Date(t).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });

async function saveNote() {
  await app.saveNote(props.entry.id, en.value, zh.value);
  saved.value = true;
}

async function reset() {
  if (confirm(`清掉“${props.entry.term}”的学习记录，让它回到未学？`)) await app.resetEntry(props.entry.id);
}

async function remove() {
  if (confirm(`删除“${props.entry.term}”？它的学习记录也会一起删除。`)) await app.deleteUserEntry(props.entry.id);
}
</script>

<template>
  <div class="detail stack">
    <EntryFacts :entry="entry" show-situation compact />

    <p v-if="leech" class="notice">
      这一条反复忘记，已经自动暂停。换个角度记它：在下面写一句关于自己经历的句子，保存后恢复复习。
    </p>

    <div v-if="states.length > 0" class="small muted">
      <div v-for="s in states" :key="s.direction">
        {{ LABEL[s.direction] }}：{{ s.card.suspended ? '已暂停' : `下次 ${fmtDate(s.card.due)}` }} · 记忆稳定度
        {{ s.card.stability.toFixed(1) }} 天 · 复习 {{ s.card.reps }} 次 · 忘过 {{ s.card.lapses }} 次
      </div>
    </div>
    <p v-else class="small muted">还没学过。</p>

    <form class="stack" @submit.prevent="saveNote">
      <span class="small muted">我的句子（会优先用它出整句翻译题）</span>
      <input v-model="en" type="text" placeholder="英文：用这个表达讲一件你自己的事" @input="saved = false" />
      <input v-model="zh" type="text" placeholder="中文意思" @input="saved = false" />
      <div class="row">
        <button type="submit">保存句子</button>
        <span v-if="saved" class="small muted">已保存</span>
      </div>
    </form>

    <div class="row">
      <button v-if="states.length > 0" type="button" @click="app.setSuspended(entry.id, !suspended)">
        {{ suspended ? '恢复复习' : '暂停复习' }}
      </button>
      <button v-if="states.length > 0" type="button" @click="reset">重置进度</button>
      <button v-if="entry.source === 'user'" type="button" class="danger" @click="remove">删除词条</button>
    </div>
  </div>
</template>

<style scoped>
.detail {
  padding: 16px;
  background: var(--bg);
  border-radius: 8px;
}

input {
  width: 100%;
}
</style>
