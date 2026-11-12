<script setup lang="ts">
import SpeakButton from '../components/SpeakButton.vue';
import { DESIGN_GUIDE } from '../speaking/designGuide';
import { useSpeaking } from '../stores/speaking';

const speaking = useSpeaking();
const practice = speaking.nextQuestion('system-design');
</script>

<template>
  <div class="stack">
    <div class="row between">
      <RouterLink to="/speak" class="btn ghost">← 题库</RouterLink>
      <RouterLink v-if="practice" :to="`/speak/${practice.id}`" class="btn primary">练一道系统设计题</RouterLink>
    </div>
    <h1>系统设计讲解框架</h1>
    <p class="muted">
      系统设计题没有标准答案，面试官看的是你怎么组织思路。按下面的顺序讲，每一步都有固定的开场句，背熟之后就不用临场想怎么开口。括号里是
      45 分钟面试的大致时间分配。
    </p>

    <section v-for="(step, i) in DESIGN_GUIDE" :key="step.title" class="panel stack">
      <div class="row between">
        <h2>{{ i + 1 }}. {{ step.title }}</h2>
        <span class="muted small">约 {{ step.minutes }} 分钟</span>
      </div>
      <p class="muted small">{{ step.goal }}</p>
      <ul class="phrases">
        <li v-for="p in step.phrases" :key="p.en">
          <div class="row tight">
            <span class="grow">{{ p.en }}</span>
            <SpeakButton :text="p.en" />
          </div>
          <div class="muted small">{{ p.zh }}</div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.phrases {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.phrases li {
  padding-left: 12px;
  border-left: 3px solid var(--border);
}

.tight {
  flex-wrap: nowrap;
  align-items: flex-start;
  gap: 4px;
}
</style>
