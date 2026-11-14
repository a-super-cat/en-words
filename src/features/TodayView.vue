<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue';
import { BACKUP_REMIND_DAYS, daysSinceBackup, endOfDay } from '../srs/queue';
import { useApp } from '../stores/app';
import { useSpeaking } from '../stores/speaking';
import { useVocab } from '../stores/vocab';
import { useWords } from '../stores/words';
import { loadDictionary, type Dictionary } from '../vocab/dictionary';
import { buildWordQueue, introducedToday } from '../vocab/words';

const app = useApp();
const speaking = useSpeaking();
const vocab = useVocab();
const words = useWords();
const dict = shallowRef<Dictionary | null>(null);
onMounted(() => {
  app.tick();
  void loadDictionary().then((d) => (dict.value = d));
});

// 今天推荐练的题和场景：轮到最久没练的分类
const question = computed(() => speaking.nextQuestion());
const scenario = computed(() => speaking.nextScenario());

// 单词线今天的量：到期复习不用等词典，新词数要等词典加载完才算得出
const wordDue = computed(
  () => words.all.filter((c) => !c.suspended && c.due <= endOfDay(app.now)).length,
);
const wordToday = computed(() => {
  const d = dict.value;
  if (!d) return { due: wordDue.value, fresh: 0, total: wordDue.value };
  const q = buildWordQueue({
    cards: words.all,
    notebookWords: vocab.notebook.map((e) => e.term),
    ranked: d.ranked,
    marks: vocab.marks,
    knownRank: app.settings.knownRank,
    newLimit: app.settings.newWordsPerDay - introducedToday(words.all, app.now),
    now: app.now,
    studying: vocab.studied.studying,
    mastered: vocab.studied.mastered,
  });
  return { due: q.due.length, fresh: q.fresh.length, total: q.due.length + q.fresh.length };
});

const SECONDS_PER_REVIEW = 12;
const SECONDS_PER_NEW = 30;

// 备份提醒：有学习数据、且从没导出过备份或距上次导出满一周时才出现，不天天打扰
const backupDays = computed(() => daysSinceBackup(app.lastBackupAt, app.now));
const backupReminder = computed<'never' | 'stale' | null>(() => {
  if (app.cards.size === 0) return null;
  if (app.lastBackupAt === null) return 'never';
  return (backupDays.value ?? 0) >= BACKUP_REMIND_DAYS ? 'stale' : null;
});

const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
const reviewMinutes = computed(() => Math.ceil((app.dueCount.total * SECONDS_PER_REVIEW) / 60));
const learnMinutes = computed(() => Math.ceil((app.newRemaining * SECONDS_PER_NEW) / 60));
const spentMinutes = computed(() => Math.round(app.todayStats.ms / 60_000));

// 今日页只按四层汇总，各分类的明细在统计页
const LAYER_TITLE = { A: '通用核心', B: '职场沟通', C: '技术和面试', D: '学术书面' } as const;
const rows = computed(() =>
  (['A', 'B', 'C', 'D'] as const).map((layer) => {
    const sum = { total: 0, learned: 0, mature: 0 };
    for (const c of app.categories) {
      if (c.layer !== layer) continue;
      const p = app.progress.get(c.key);
      if (p) (sum.total += p.total), (sum.learned += p.learned), (sum.mature += p.mature);
    }
    return { key: layer, layer, title: LAYER_TITLE[layer], off: false, ...sum };
  }),
);
const totals = computed(() =>
  rows.value.reduce(
    (t, r) => ({ total: t.total + r.total, learned: t.learned + r.learned, mature: t.mature + r.mature }),
    { total: 0, learned: 0, mature: 0 },
  ),
);
</script>

<template>
  <div class="stack">
    <div class="row between">
      <h1>{{ today }}</h1>
      <span class="badge" :class="{ good: app.streak > 0 }">连续 {{ app.streak }} 天</span>
    </div>

    <section v-if="backupReminder" class="panel row between">
      <p class="small">
        <template v-if="backupReminder === 'never'">
          学习数据只存在这台设备上，你还没有导出过备份。导出一份，换设备或清数据时能恢复。
        </template>
        <template v-else>距上次导出备份已经 {{ backupDays }} 天了，建议再导出一份。</template>
      </p>
      <RouterLink to="/settings" class="btn">去导出</RouterLink>
    </section>

    <div class="today-grid">
      <RouterLink v-if="app.dueCount.total > 0" to="/review" class="today-card">
        <span class="muted small">复习</span>
        <span class="num">{{ app.dueCount.total }}</span>
        <span class="muted small">
          开口 {{ app.dueCount.produce }} · 认读 {{ app.dueCount.recognize }} · 约 {{ reviewMinutes }} 分钟
        </span>
      </RouterLink>
      <div v-else class="today-card off">
        <span class="muted small">复习</span>
        <span class="num">0</span>
        <span class="muted small">今天没有到期的复习</span>
      </div>

      <RouterLink v-if="app.newRemaining > 0" to="/learn" class="today-card">
        <span class="muted small">新学词条</span>
        <span class="num">{{ app.newRemaining }}</span>
        <span class="muted small">已学 {{ app.learnedToday }} 条 · 约 {{ learnMinutes }} 分钟</span>
      </RouterLink>
      <RouterLink
        v-else-if="app.unseenCount > 0"
        :to="{ path: '/learn', query: { extra: '1' } }"
        class="today-card"
      >
        <span class="muted small">新学词条</span>
        <span class="num">{{ app.unseenCount }}</span>
        <span class="muted small">今日额度已学完，点按再学一组</span>
      </RouterLink>
      <div v-else class="today-card off">
        <span class="muted small">新学词条</span>
        <span class="num">0</span>
        <span class="muted small">词条都学过了</span>
      </div>

      <RouterLink to="/words" class="today-card" :class="{ off: wordToday.total === 0 }">
        <span class="muted small">单词</span>
        <span class="num">{{ wordToday.total }}</span>
        <span class="muted small">
          <template v-if="wordToday.total > 0">待复习 {{ wordToday.due }} · 新词 {{ wordToday.fresh }}</template>
          <template v-else>今天的单词学完了</template>
        </span>
      </RouterLink>

      <RouterLink v-if="scenario" :to="`/scenarios/${scenario.id}`" class="today-card">
        <span class="muted small">场景 · 今天已练 {{ speaking.today.scenarios }} 个</span>
        <span class="tc-title">{{ scenario.title }}</span>
        <span class="muted small">{{ scenario.setting }}</span>
      </RouterLink>
      <div v-else class="today-card off">
        <span class="muted small">场景</span>
        <span class="tc-title">场景库还是空的</span>
      </div>
    </div>

    <section class="panel row between">
      <div>
        <h2>口语</h2>
        <p class="muted small">今天已口答 {{ speaking.today.questions }} 题</p>
        <p v-if="question" class="small next">{{ question.prompt }}</p>
      </div>
      <RouterLink v-if="question" :to="`/speak/${question.id}`" class="btn primary">答这道题</RouterLink>
    </section>

    <section class="panel">
      <div class="row between">
        <h2>进度</h2>
        <span class="muted small">今天复习 {{ app.todayStats.reviews }} 张 · 用时 {{ spentMinutes }} 分钟</span>
      </div>
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
          <tr v-for="r in rows" :key="r.key" :class="{ muted: r.off }">
            <td>
              <span class="badge">{{ r.layer }}</span> {{ r.title }}
              <span v-if="r.off" class="small">（已关闭）</span>
            </td>
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
      <p class="muted small" style="margin-top: 8px">
        “已掌握”指记忆稳定在 3 周以上。生词本里的词在<RouterLink to="/words">单词</RouterLink>里单独一条线学：在阅读里收词，或者在单词页做测评和筛查。各分类的明细见<RouterLink to="/stats">统计</RouterLink>。
      </p>
    </section>
  </div>
</template>

<style scoped>
.next {
  max-width: 420px;
  margin-top: 4px;
}

/* 今日页的大卡片：整张可点，数字和下一步动作一眼看清 */
.today-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.today-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: inherit;
  text-decoration: none;
}

a.today-card:active {
  background: var(--bg);
}

.today-card.off {
  opacity: 0.65;
}

.today-card .num {
  font-size: 1.9rem;
  line-height: 1.15;
}

.tc-title {
  font-weight: 600;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
