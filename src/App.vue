<script setup lang="ts">
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useApp } from './stores/app';
import { useSpeaking } from './stores/speaking';

const app = useApp();
const speaking = useSpeaking();
const route = useRoute();
const router = useRouter();

// 底部 Tab 的四个主页才显示标题栏和 Tab 栏，子页面是沉浸式全屏（靠安卓返回键和页面内导航返回）
const isRoot = computed(() => route.meta.root === true);
const title = computed(() => route.meta.title ?? 'en-words');

// 页面切换动画：Tab 之间按左右顺序滑动，进出子页面淡入淡出
const transitionName = ref('fade');
router.afterEach((to, from) => {
  const tt = to.meta.tab;
  const ft = from.meta.tab;
  transitionName.value =
    tt !== undefined && ft !== undefined && tt !== ft ? (tt > ft ? 'slide-left' : 'slide-right') : 'fade';
});

const TABS = [
  { to: '/', label: '今日', tab: 0 },
  { to: '/words', label: '单词', tab: 1 },
  { to: '/scenes', label: '场景', tab: 2 },
  { to: '/reading', label: '阅读', tab: 3 },
];

// 安卓返回键：有历史就后退，没有就退出。不接管的话按返回会直接退出应用，
// 练到一半误触就全丢了。网页版没有这个事件，不受影响。
if (Capacitor.isNativePlatform()) {
  void CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void CapApp.exitApp();
  });
}
</script>

<template>
  <main v-if="app.error">
    <div class="notice bad">
      数据加载失败：{{ app.error }}。请确认浏览器允许本站使用本地存储（无痕模式下可能被禁用）。
    </div>
  </main>
  <div v-else-if="app.ready && speaking.ready" class="frame" :class="{ 'with-tabs': isRoot }">
    <header v-if="isRoot" class="appbar">
      <span class="appbar-title">{{ title }}</span>
      <RouterLink v-if="route.path !== '/me'" to="/me" class="appbar-me" aria-label="我的">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
      </RouterLink>
    </header>
    <main>
      <!-- 按路径重建页面：从一道题跳到另一道题时，计时、录音这些状态要从头开始 -->
      <RouterView v-slot="{ Component }">
        <Transition :name="transitionName" mode="out-in">
          <component :is="Component" :key="route.path" />
        </Transition>
      </RouterView>
    </main>
    <nav v-if="isRoot" class="tabbar">
      <RouterLink v-for="t in TABS" :key="t.to" :to="t.to" :class="{ active: route.meta.tab === t.tab }">
        <svg v-if="t.tab === 0" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <svg v-else-if="t.tab === 1" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7.5 10.5h6M7.5 14h9.5" />
        </svg>
        <svg v-else-if="t.tab === 2" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5c-1.1 0-2.2-.24-3.1-.68L4 20l1.7-4.9A7.5 7.5 0 1 1 20 11.5Z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 6.5C10 5 7.4 4.5 4 4.5v14c3.4 0 6 .5 8 2 2-1.5 4.6-2 8-2v-14c-3.4 0-6 .5-8 2Z" />
          <path d="M12 6.5v14" />
        </svg>
        <span>{{ t.label }}</span>
      </RouterLink>
    </nav>
  </div>
  <main v-else class="muted center">正在加载…</main>
</template>
