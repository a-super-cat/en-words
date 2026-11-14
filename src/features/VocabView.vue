<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue';
import { entryStatus } from '../srs/stats';
import { useApp } from '../stores/app';
import { useVocab } from '../stores/vocab';
import { BAND_SIZE, MAX_BANDS, bandOf, bandRange, bandWords } from '../vocab/assess';
import { loadDictionary, type Dictionary } from '../vocab/dictionary';

defineProps<{ embedded?: boolean }>();

const app = useApp();
const vocab = useVocab();
const dict = shallowRef<Dictionary | null>(null);
onMounted(async () => (dict.value = await loadDictionary()));

const fmtDate = (t: number) => new Date(t).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });

// 筛查建议从“默认认识”的范围之后的第一段开始：更靠前的大多认识，筛起来不划算
const suggested = computed(() => Math.min(MAX_BANDS, bandOf(app.settings.knownRank) + 1));

const bands = computed(() => {
  const d = dict.value;
  if (!d) return [];
  return Array.from({ length: MAX_BANDS }, (_, i) => {
    const band = i + 1;
    let known = 0;
    let unknown = 0;
    for (const w of bandWords(d.ranked, band)) {
      const mark = vocab.marks.get(w.word.toLowerCase());
      if (mark === 'known') known++;
      else if (mark === 'unknown') unknown++;
    }
    return { band, range: bandRange(band), known, unknown, left: BAND_SIZE - known - unknown };
  });
});

const notebook = computed(() => {
  const counts = { new: 0, learning: 0, mature: 0, suspended: 0 };
  for (const e of vocab.notebook) counts[entryStatus(e, app.cards)]++;
  return { total: vocab.notebook.length, ...counts };
});

function setKnownRank(event: Event) {
  const value = Math.round(Number((event.target as HTMLInputElement).value) / BAND_SIZE) * BAND_SIZE;
  if (Number.isFinite(value)) void app.updateSettings({ knownRank: Math.min(30000, Math.max(BAND_SIZE, value)) });
}
</script>

<template>
  <div class="stack">
    <h1 v-if="!embedded">词汇</h1>

    <section class="panel stack">
      <div class="row between">
        <div>
          <h2>词汇量测评</h2>
          <template v-if="vocab.latest">
            <div class="num">约 {{ vocab.latest.size.toLocaleString() }} 词</div>
            <p class="muted small">{{ fmtDate(vocab.latest.at) }} 测评 · 共测过 {{ vocab.assessments.length }} 次</p>
          </template>
          <p v-else class="muted small">还没测过。大约 10 分钟，按词频从高到低抽样，几乎都不认识时自动结束。</p>
        </div>
        <RouterLink to="/vocab/assess" class="btn primary">{{ vocab.latest ? '重新测评' : '开始测评' }}</RouterLink>
      </div>
      <label class="field">
        阅读助手默认认识最常用的前多少个词（测评会自动设置，也可以自己改）
        <input
          type="number"
          min="1000"
          max="30000"
          step="1000"
          :value="app.settings.knownRank"
          @change="setKnownRank"
        />
      </label>
    </section>

    <section class="panel row between">
      <div>
        <h2>生词本</h2>
        <div class="num">{{ notebook.total }}</div>
        <p class="muted small">
          未学 {{ notebook.new }} · 学习中 {{ notebook.learning }} · 已掌握 {{ notebook.mature }}
        </p>
        <p class="muted small">
          从测评、筛查和阅读里收进来的词。最常用的 3000 词以内练到说得出，其余只练认读。它们和其他新内容一起，每天按组学习。
        </p>
      </div>
      <RouterLink to="/reading" class="btn">去阅读里收词</RouterLink>
    </section>

    <section class="panel stack">
      <h2>分段筛查</h2>
      <p class="muted small">
        把一段词频范围里的词快速过一遍：认识的按 2，不认识的按 1 并自动收进生词本。每次 50 个，随时可以停。这样只学不会的词，不在已经会的词上花时间。
      </p>
      <p v-if="!dict" class="muted">正在加载词典…</p>
      <table v-else>
        <thead>
          <tr>
            <th>词频范围</th>
            <th class="n">认识</th>
            <th class="n">不认识</th>
            <th class="n">没筛过</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in bands" :key="b.band">
            <td>
              {{ b.range[0] }}–{{ b.range[1] }}
              <span v-if="b.band === suggested" class="badge accent">建议从这里开始</span>
            </td>
            <td class="n">{{ b.known }}</td>
            <td class="n">{{ b.unknown }}</td>
            <td class="n">{{ b.left }}</td>
            <td class="n">
              <RouterLink v-if="b.left > 0" :to="`/vocab/triage/${b.band}`" class="btn small-btn">筛查</RouterLink>
              <span v-else class="badge good">筛完了</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
input {
  max-width: 160px;
}

.small-btn {
  padding: 2px 12px;
  font-size: 0.85rem;
}
</style>
