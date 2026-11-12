# 给 AI 助手的说明

这是一个自用的英语训练工具（Vue 3 + TypeScript + Vite，数据存在浏览器的 IndexedDB 里）。用户的母语是中文，请用中文交流。

**开始任何工作之前，先完整读这两份文档：**

1. [docs/HANDOFF.md](docs/HANDOFF.md)：项目现状、架构、业务规则、容易踩的坑、怎么验证。
2. [docs/ROADMAP.md](docs/ROADMAP.md)：接下来做什么，每个任务怎么做、怎样算完成。

## 最重要的规则

1. 端口固定是 5310，不要改。
2. 运行 npm、npx、node 命令用 PowerShell，不要用 Git Bash。
3. 不要改 `src/content/slug.ts`，不要改已有词条的英文（`term`）。
4. 往 IndexedDB 存数据时只能存普通对象，不能存 Vue 的响应式对象。
5. 改数据库表结构时新增一个 `version(n)`，不要改已有的。
6. 不要直接 `import` `content/wordlists/frequency.json`，用 `loadDictionary()`。
7. 在浏览器里测试时不要清空用户的学习数据。
8. 一次只做一个任务，不要扩大范围，不要做没被要求的重构。

## 改完代码必须通过的检查

```bash
npx vue-tsc --noEmit
```

```bash
npx vitest run
```

```bash
npm run validate
```

```bash
npm run build
```

## 需要先问用户的事

下载文件、`git init` 或提交、引入新的依赖、清空或迁移用户数据、接入需要 API Key 或联网的服务。

## 汇报时

说清楚做了什么、验证了什么、**没验证什么**。不要把没有实际运行过的东西说成“已验证”。
