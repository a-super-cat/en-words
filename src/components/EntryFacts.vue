<script setup lang="ts">
import { computed } from 'vue';
import { useApp } from '../stores/app';
import type { Entry } from '../types';
import Highlight from './Highlight.vue';
import SpeakButton from './SpeakButton.vue';

const props = defineProps<{ entry: Entry; showSituation?: boolean; compact?: boolean }>();
const app = useApp();

const note = computed(() => app.notes.get(props.entry.id));
const registerLabel = { formal: '正式', neutral: '', casual: '口语' } as const;
</script>

<template>
  <div class="facts">
    <div class="row head">
      <span :class="compact ? 'term' : 'big'">{{ entry.term }}</span>
      <SpeakButton :text="entry.term" />
      <span v-if="entry.ipa" class="muted">{{ entry.ipa }}</span>
      <span v-if="entry.register && registerLabel[entry.register]" class="badge">{{ registerLabel[entry.register] }}</span>
    </div>
    <p class="zh">{{ entry.zh }}</p>

    <ul v-if="entry.examples.length > 0 || note" class="examples">
      <li v-if="note && (note.en || note.zh)">
        <div class="row tight">
          <span class="badge accent">我的句子</span>
          <span class="grow"><Highlight :text="note.en" :term="entry.term" /></span>
          <SpeakButton v-if="note.en" :text="note.en" />
        </div>
        <div class="muted small">{{ note.zh }}</div>
      </li>
      <li v-for="(x, i) in entry.examples" :key="i">
        <div class="row tight">
          <span class="grow"><Highlight :text="x.en" :term="entry.term" /></span>
          <SpeakButton :text="x.en" />
        </div>
        <div v-if="x.zh" class="muted small">{{ x.zh }}</div>
      </li>
    </ul>

    <div v-if="showSituation && entry.situation" class="situation">
      <div class="muted small">情境：{{ entry.situation.zh }}</div>
      <div class="row tight">
        <span class="grow"><Highlight :text="entry.situation.en" :term="entry.term" /></span>
        <SpeakButton :text="entry.situation.en" />
      </div>
    </div>

    <p v-if="entry.collocations?.length" class="small"><span class="muted">搭配：</span>{{ entry.collocations.join(' · ') }}</p>
    <p v-if="entry.note" class="small note">{{ entry.note }}</p>
  </div>
</template>

<style scoped>
.facts {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.head {
  gap: 6px;
}

.term {
  font-size: 1.2rem;
  font-weight: 600;
}

.zh {
  font-size: 1.05rem;
}

.examples {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.examples li,
.situation {
  padding-left: 12px;
  border-left: 3px solid var(--border);
}

.tight {
  gap: 4px;
  flex-wrap: nowrap;
  align-items: flex-start;
}

.note {
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--bg);
}
</style>
