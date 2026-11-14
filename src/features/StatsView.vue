<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue';
import BarChart from '../components/BarChart.vue';
import { startOfDay } from '../srs/queue';
import { DAY } from '../srs/schedule';
import { MATURE_DAYS, forecast, minutesByDay } from '../srs/stats';
import { useApp } from '../stores/app';
import { useSpeaking } from '../stores/speaking';
import { useVocab } from '../stores/vocab';
import { useWords } from '../stores/words';
import { wordStatus } from '../vocab/words';
import type { Direction, ReviewLog } from '../types';

const DAYS = 30;
const DIRECTIONS: { key: Direction; label: string }[] = [
  { key: 'produce', label: '中译英（说得出）' },
  { key: 'recognize', label: '认读（看得懂）' },
];

const app = useApp();
const speaking = useSpeaking();
const vocab = useVocab();
const words = useWords();

// 单词线的汇总（和词条分开统计）：按卡的状态数，明天到期数按排期直接算
const wordStats = computed(() => {
  let learning = 0;
  let mastered = 0;
  let suspended = 0;
  let dueTomorrow = 0;
  const start = startOfDay(Date.now());
  for (const c of words.all) {
    const s = wordStatus(c);
    if (s === 'mature') mastered++;
    else if (s === 'suspended') suspended++;
    else learning++;
    if (!c.suspended && c.due >= start + DAY && c.due < start + 2 * DAY) dueTomorrow++;
  }
  return { total: words.all.length, learning, mastered, suspended, dueTomorrow };
});

const logs = shallowRef<ReviewLog[]>([]);
onMounted(async () => {
  app.tick();
  logs.value = await app.logsSince(startOfDay(Date.now()) - (DAYS - 1) * DAY);
});

const dayLabel = (offset: number) => {
  const d = new Date(startOfDay(app.now) + offset * DAY);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const live = computed(() => [...app.cards.values()].filter((c) => app.byId.has(c.entryId)));

const upcoming = computed(() =>
  forecast(live.value, app.now, DAYS).map((value, i) => ({ label: i === 0 ? '今天' : dayLabel(i), value })),
);

// 学习时长 = 复习 + 新学（stage 0 的日志，ms 是整组用时均摊的）+ 口答 + 场景对话。
// 自动带过的识别卡（auto）不算，那份时间已经记在对应的产出卡上了。
const spent = computed(() => {
  const records = [
    ...logs.value.filter((l) => !l.auto).map((l) => ({ at: l.at, ms: l.ms })),
    ...speaking.attempts.map((a) => ({ at: a.at, ms: a.seconds * 1000 })),
    ...speaking.runs.map((r) => ({ at: r.at, ms: (r.seconds ?? 0) * 1000 })),
  ];
  return minutesByDay(records, app.now, DAYS, 180_000).map((value, i) => ({ label: dayLabel(i - DAYS + 1), value }));
});

const byDirection = computed(() =>
  DIRECTIONS.map(({ key, label }) => {
    const cards = live.value.filter((c) => c.direction === key && !c.suspended);
    const mature = cards.filter((c) => c.stability >= MATURE_DAYS).length;
    return { label, learning: cards.length - mature, mature, total: cards.length };
  }),
);

const rows = computed(() =>
  app.categories.map((c) => ({ ...c, ...(app.progress.get(c.key) ?? { total: 0, learned: 0, mature: 0 }) })),
);
const totals = computed(() =>
  rows.value.reduce(
    (t, r) => ({ total: t.total + r.total, learned: t.learned + r.learned, mature: t.mature + r.mature }),
    { total: 0, learned: 0, mature: 0 },
  ),
);

const practiced = computed(() => ({
  questions: speaking.lastAttemptAt.size,
  scenarios: speaking.lastRunAt.size,
}));
const lastReading = computed(() => vocab.readings.at(-1));
</script>

<template>
  <div class="stack">
    <h1>统计</h1>

    <section class="tiles">
      <div class="panel tile">
        <div class="num">{{ app.streak }}</div>
        <div class="muted small">连续学习天数</div>
      </div>
      <div class="panel tile">
        <div class="num">{{ totals.learned }}</div>
        <div class="muted small">已学词条 / 共 {{ totals.total }}</div>
      </div>
      <div class="panel tile">
        <div class="num">{{ totals.mature }}</div>
        <div class="muted small">已掌握（稳定 3 周以上）</div>
      </div>
      <div class="panel tile">
        <div class="num">{{ vocab.latest ? vocab.latest.size.toLocaleString() : '—' }}</div>
        <div class="muted small">
          认读词汇量估计
          <RouterLink v-if="!vocab.latest" to="/vocab/assess">去测评</RouterLink>
        </div>
      </div>
      <div class="panel tile">
        <div class="num">{{ practiced.questions }}</div>
        <div class="muted small">练过的面试题 / 共 {{ speaking.questions.length }}</div>
      </div>
      <div class="panel tile">
        <div class="num">{{ lastReading ? `${(lastReading.coverage * 100).toFixed(1)}%` : '—' }}</div>
        <div class="muted small">最近一次阅读的认识占比</div>
      </div>
    </section>

    <section class="panel stack">
      <h2>单词线</h2>
      <p class="muted small">
        已引入 {{ wordStats.total }} 个词 · 学习中 {{ wordStats.learning }} · 已掌握 {{ wordStats.mastered }} ·
        已暂停 {{ wordStats.suspended }} · 明天到期 {{ wordStats.dueTomorrow }} 个
      </p>
      <div><RouterLink to="/words" class="btn">去学单词</RouterLink></div>
    </section>

    <section class="panel">
      <BarChart title="未来 30 天每天到期的复习" unit="张" :items="upcoming" />
      <p class="muted small note">按当前的排期计算，实际会随每次评分变化。今天的数字包含之前拖下来的。</p>
    </section>

    <section class="panel">
      <BarChart title="过去 30 天每天的学习时长" unit="分钟" :items="spent" />
      <p class="muted small note">复习、新学、口答和场景对话的时间都算在内；场景对话的时长从 2026-11-12 之后才有记录。</p>
    </section>

    <section class="panel stack">
      <h2>两个方向</h2>
      <p class="muted small">
        生词本里的书面词只练认读，所以认读的合计会多一些。要留意的是“已掌握”一列：中译英掌握的明显比认读少，说明“认识但说不出”的词在积压。
      </p>
      <table>
        <thead>
          <tr>
            <th>方向</th>
            <th class="n">学习中</th>
            <th class="n">已掌握</th>
            <th class="n">合计</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in byDirection" :key="d.label">
            <td>{{ d.label }}</td>
            <td class="n">{{ d.learning }}</td>
            <td class="n">{{ d.mature }}</td>
            <td class="n">{{ d.total }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="panel stack">
      <h2>各分类进度</h2>
      <table>
        <thead>
          <tr>
            <th>分类</th>
            <th class="n">已学</th>
            <th class="n">已掌握</th>
            <th class="n">总数</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.key">
            <td><span class="badge">{{ r.layer }}</span> {{ r.title }}</td>
            <td class="n">{{ r.learned }}</td>
            <td class="n">{{ r.mature }}</td>
            <td class="n">{{ r.total }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th>合计</th>
            <th class="n">{{ totals.learned }}</th>
            <th class="n">{{ totals.mature }}</th>
            <th class="n">{{ totals.total }}</th>
          </tr>
        </tfoot>
      </table>
      <p class="muted small">“已掌握”以中译英方向为准（只练认读的词以认读为准），指记忆稳定在 3 周以上。</p>
    </section>
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}

.tile {
  padding: 14px 16px;
}

.note {
  margin-top: 8px;
}
</style>
