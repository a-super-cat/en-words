<script setup lang="ts">
// “我的”：低频入口的收纳页（统计、设置）。从每个主页右上角的图标进来，不占底部 Tab
</script>

<template>
  <div class="stack">
    <ul class="list">
      <li>
        <RouterLink to="/stats" class="item">
          <span class="grow">
            <span class="name">统计</span>
            <span class="muted small">学习进度、复习量和各分类掌握情况</span>
          </span>
          <span class="chev">›</span>
        </RouterLink>
      </li>
      <li>
        <RouterLink to="/settings" class="item">
          <span class="grow">
            <span class="name">设置</span>
            <span class="muted small">朗读引擎与语速、每日目标、数据备份与恢复</span>
          </span>
          <span class="chev">›</span>
        </RouterLink>
      </li>
    </ul>
    <p class="muted small">en-words · 学习数据只存在这台设备上，记得定期在设置里导出备份。</p>
  </div>
</template>

<style scoped>
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.list li + li {
  border-top: 1px solid var(--border);
}

.item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  color: inherit;
  text-decoration: none;
}

.item:active {
  background: var(--bg);
}

.name {
  display: block;
  font-weight: 600;
}

.chev {
  color: var(--muted);
  font-size: 1.3rem;
  line-height: 1;
}
</style>
