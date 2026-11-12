import { createRouter, createWebHashHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('./features/TodayView.vue') },
    { path: '/learn', component: () => import('./features/LearnView.vue') },
    { path: '/review', component: () => import('./features/ReviewView.vue') },
    { path: '/speak', component: () => import('./features/SpeakListView.vue') },
    { path: '/speak/stories', component: () => import('./features/StoriesView.vue') },
    { path: '/speak/system-design', component: () => import('./features/DesignGuideView.vue') },
    { path: '/speak/:id', component: () => import('./features/SpeakView.vue') },
    { path: '/scenarios', component: () => import('./features/ScenarioListView.vue') },
    { path: '/scenarios/:id', component: () => import('./features/ScenarioView.vue') },
    { path: '/reading', component: () => import('./features/ReadingView.vue') },
    { path: '/vocab', component: () => import('./features/VocabView.vue') },
    { path: '/vocab/assess', component: () => import('./features/VocabDrillView.vue') },
    { path: '/vocab/triage/:band', component: () => import('./features/VocabDrillView.vue') },
    { path: '/library', component: () => import('./features/LibraryView.vue') },
    { path: '/stats', component: () => import('./features/StatsView.vue') },
    { path: '/settings', component: () => import('./features/SettingsView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
