<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import SegTabs from '../components/SegTabs.vue';
import LibraryView from './LibraryView.vue';
import VocabView from './VocabView.vue';

const route = useRoute();
// 带查询参数进来（从复习页查词、从旅游页看旅游词汇）时直接落在“词条”一侧
const seg = ref(route.query.q || route.query.cat ? 'entries' : 'words');
</script>

<template>
  <div class="stack">
    <SegTabs
      v-model="seg"
      :options="[
        { key: 'words', label: '单词' },
        { key: 'entries', label: '词条' },
      ]"
    />
    <VocabView v-if="seg === 'words'" embedded />
    <LibraryView v-else embedded />
  </div>
</template>
