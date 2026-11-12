<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useApp } from '../stores/app';
import { useSpeaking } from '../stores/speaking';

const app = useApp();
const speaking = useSpeaking();
onMounted(app.tick);

// 今天推荐练的题和场景：轮到最久没练的分类
const question = computed(() => speaking.nextQuestion());
const scenario = computed(() => speaking.nextScenario());

const SECONDS_PER_REVIEW = 12;
const SECONDS_PER_NEW = 30;

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

    <section class="panel row between">
      <div>
        <h2>复习</h2>
        <div class="num">{{ app.dueCount.total }}</div>
        <p v-if="app.dueCount.total > 0" class="muted small">
          开口说 {{ app.dueCount.produce }} 张 · 认读 {{ app.dueCount.recognize }} 张 · 约 {{ reviewMinutes }} 分钟
        </p>
        <p v-else class="muted small">今天没有到期的复习。</p>
      </div>
      <RouterLink v-if="app.dueCount.total > 0" to="/review" class="btn primary">开始复习</RouterLink>
    </section>

    <section class="panel row between">
      <div>
        <h2>新学</h2>
        <div class="num">{{ app.newRemaining }}</div>
        <p class="muted small">
          今天已学 {{ app.learnedToday }} 条 · 还有 {{ app.unseenCount }} 条没学
          <template v-if="app.newRemaining > 0"> · 约 {{ learnMinutes }} 分钟</template>
        </p>
        <p v-if="app.dueCount.total > 0 && app.newRemaining > 0" class="muted small">建议先做完复习，再学新内容。</p>
      </div>
      <RouterLink v-if="app.newRemaining > 0" to="/learn" class="btn" :class="{ primary: app.dueCount.total === 0 }">
        学新内容
      </RouterLink>
      <RouterLink v-else-if="app.unseenCount > 0" :to="{ path: '/learn', query: { extra: '1' } }" class="btn">
        再学一组
      </RouterLink>
    </section>

    <section class="panel row between">
      <div>
        <h2>口语</h2>
        <p class="muted small">
          今天口答 {{ speaking.today.questions }} 题 · 场景 {{ speaking.today.scenarios }} 个
        </p>
        <p v-if="question" class="small next">{{ question.prompt }}</p>
      </div>
      <div class="row">
        <RouterLink v-if="question" :to="`/speak/${question.id}`" class="btn">答这道题</RouterLink>
        <RouterLink v-if="scenario" :to="`/scenarios/${scenario.id}`" class="btn">练一个场景</RouterLink>
      </div>
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
        “已掌握”指记忆稳定在 3 周以上。A 层和 D 层的词来自生词本：在<RouterLink to="/reading">阅读</RouterLink>里收词，或者到<RouterLink
          to="/vocab"
          >词汇</RouterLink
        >里做测评和筛查。各分类的明细见<RouterLink to="/stats">统计</RouterLink>。
      </p>
    </section>
  </div>
</template>

<style scoped>
.next {
  max-width: 420px;
  margin-top: 4px;
}
</style>
