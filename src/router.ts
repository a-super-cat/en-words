import { createRouter, createWebHashHistory } from 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    /** 是不是底部 Tab 的主页（决定要不要显示标题栏和 Tab 栏） */
    root?: boolean;
    /** Tab 顺序，用来决定页面切换动画的方向 */
    tab?: number;
    title?: string;
  }
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('./features/TodayView.vue'), meta: { root: true, tab: 0, title: '今日' } },
    { path: '/learn', component: () => import('./features/LearnView.vue') },
    { path: '/review', component: () => import('./features/ReviewView.vue') },
    { path: '/speak', component: () => import('./features/SpeakListView.vue') },
    { path: '/speak/stories', component: () => import('./features/StoriesView.vue') },
    { path: '/speak/system-design', component: () => import('./features/DesignGuideView.vue') },
    { path: '/speak/:id', component: () => import('./features/SpeakView.vue') },
    { path: '/scenes', component: () => import('./features/ScenesTabView.vue'), meta: { root: true, tab: 2, title: '场景' } },
    { path: '/scenarios', redirect: '/scenes' },
    { path: '/scenarios/:id', component: () => import('./features/ScenarioView.vue') },
    { path: '/reading', component: () => import('./features/ReadingView.vue'), meta: { root: true, tab: 3, title: '阅读' } },
    { path: '/words', component: () => import('./features/WordsTabView.vue'), meta: { root: true, tab: 1, title: '单词' } },
    { path: '/words/study', component: () => import('./features/WordStudyView.vue') },
    { path: '/words/notebook', component: () => import('./features/WordBookView.vue') },
    { path: '/vocab', redirect: '/words' },
    { path: '/vocab/assess', component: () => import('./features/VocabDrillView.vue') },
    { path: '/vocab/triage/:band', component: () => import('./features/VocabDrillView.vue') },
    { path: '/library', redirect: (to) => ({ path: '/words', query: to.query }) },
    { path: '/me', component: () => import('./features/MeView.vue'), meta: { root: true, title: '我的' } },
    { path: '/stats', component: () => import('./features/StatsView.vue') },
    { path: '/settings', component: () => import('./features/SettingsView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
