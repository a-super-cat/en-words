<script setup lang="ts">
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { useApp } from './stores/app';
import { useSpeaking } from './stores/speaking';

const app = useApp();
const speaking = useSpeaking();

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
  <template v-else-if="app.ready && speaking.ready">
    <nav class="nav">
      <span class="brand">en-words</span>
      <RouterLink to="/">今日</RouterLink>
      <RouterLink to="/speak" class="section">口语</RouterLink>
      <RouterLink to="/scenarios" class="section">场景</RouterLink>
      <RouterLink to="/reading">阅读</RouterLink>
      <RouterLink to="/vocab" class="section">词汇</RouterLink>
      <RouterLink to="/library">词库</RouterLink>
      <RouterLink to="/stats">统计</RouterLink>
      <RouterLink to="/settings">设置</RouterLink>
    </nav>
    <main>
      <!-- 按路径重建页面：从一道题跳到另一道题时，计时、录音这些状态要从头开始 -->
      <RouterView :key="$route.path" />
    </main>
  </template>
  <main v-else class="muted center">正在加载…</main>
</template>
