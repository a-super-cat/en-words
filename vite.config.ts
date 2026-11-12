import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// 开发和预览用同一个端口：学习记录存在浏览器的 IndexedDB 里，按“地址 + 端口”隔离，
// 端口不同就会看到两份互不相通的数据。所以用一个固定的、不常见的端口（Vite 默认的 5173 容易被别的项目占用），
// 被占用时直接报错，而不是悄悄换端口。
const PORT = 5310;

export default defineConfig({
  plugins: [vue()],
  server: { port: PORT, strictPort: true },
  preview: { port: PORT, strictPort: true },
  // 词库内容是有意打进包里的，本地使用不在乎体积
  build: { chunkSizeWarningLimit: 5000 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
