# en-words 交接文档

> 写于 2026-11-10。写给接手这个项目的开发者或 AI。
> 配套文档：[ROADMAP.md](ROADMAP.md)（接下来做什么）、[design.md](design.md)（为什么这样设计）、[../README.md](../README.md)（怎么使用）。

## 0. 先读这一节

**动手前必须知道的 8 件事**。每一条的原因在第 9 节。

1. 端口固定是 **5310**，不要改，也不要让它自动换端口。
2. 运行 npm、npx、node 命令用 **PowerShell**，不要用 Git Bash。
3. 不要改 `src/content/slug.ts` 里的 `slug` 函数，不要改已有词条的 `term`（英文）。
4. 往 IndexedDB 存数据时，只能存**普通对象**，不能存 Vue 的响应式对象。
5. 改数据库表结构时，**新增**一个 `version(n)`，不要改已有的 `version()`。
6. 不要直接 `import` 词典文件 `content/wordlists/frequency.json`，用 `loadDictionary()`。
7. 在浏览器里测试时，**不要清空用户的学习数据**。测试前先看库里有没有数据，测试后只清自己造的。
8. 每次改完代码，下面四条命令都要通过才算完成：

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

## 1. 这个项目是什么

en-words 是一个**自用**的英语训练工具，只有一个用户。它跑在用户自己的电脑上，没有后端，没有账号，数据全部存在浏览器里。

**用户**：母语中文的高级全栈工程师，技术栈 React、Vue、Python、Java、Rust、Node.js。和用户交流用中文。

**用户的三个目标**：

| 目标 | 具体含义 |
|---|---|
| 英文技术面试 | 能连续 2–3 分钟讲清一个项目、一个架构决策或一道系统设计题 |
| 和英文同事协作 | 能参与站会、评审、1:1、事故处理和闲聊 |
| 读懂技术书和文献 | 读 DDIA 这类书时基本不用查词典 |

**最重要的设计原则**：以“主动说得出”为先。用户不缺“认识”的词，缺的是“开口能用”的词。所以：

- 内容是**词块**（搭配、句型），不是孤立单词。
- 每条内容有两个方向，分开记录：认读（英 → 中）和产出（中 → 英，开口说）。
- 每个练习环节都要求用户**先自己说出来，再看答案**。不要加“只看不说”的环节。
- 用户明确要求练习“有效且高效”：不在已经会的内容上浪费时间。

## 2. 当前状态

原计划分四期，前三期已完成：

| 期 | 内容 | 状态 |
|---|---|---|
| M1 | 双向间隔重复、新学小测、词库、朗读、导入导出 | 已完成 |
| M2 | 面试题口答（录音、自评、重答）、STAR 故事、系统设计框架、场景对话 | 已完成 |
| M3 | 词汇量测评、分段筛查、生词本、阅读助手、统计页 | 已完成 |
| M4 | 接 AI 做自由对话陪练和口答点评 | **没做**，用户选择先不做 |

**内容数量**：

| 类型 | 数量 | 位置 |
|---|---|---|
| 词块 | 3669 条（A 层 667，B 层 922，C 层 1729，D 层 351） | `content/entries/*.json`，106 个文件 |
| 面试题 | 235 道，12 个分类 | `content/questions/*.json` |
| 场景剧本 | 73 个，11 个分类（2026-11-12 新增面试场景分类，排在口语页首位；2026-11-13 新增日常分类；同日 P1-6 第三批补 4 个高难场景：无聊技术答辩、一级事故指挥、范围之争调停、用数据谈调薪；第四批补 3 个高难日常场景：银行异议扣款、房东押金之争、航班取消柜台改签；P1-7 第二批补 3 个压轴场景：高管汇报连环追问、技术分享被 CTO 唱反调、终面围攻深挖项目数字；2026-11-14 应用户要求新开独立主题「旅游娱乐」travel（排在分类末位，不与日常混排）6 个场景 + A 层词汇 47 条，同日深化 +7 个进阶场景（护照丢失补证、国外药店买药、误了火车改签、购物退税全程、滑雪租装备约课、演唱会之夜、退房账单争议）+ 词汇续扩 38 条；同日按用户“基本闭环还不够、要更好”的要求再升级 +8 个高难/新面场景（超售谈补偿、租车小剐蹭处理、民宿不符交涉、边检盘问、音乐节三天、温泉礼仪、自驾被警察拦下、与旅伴改计划）+ 词汇续扩 36 条，该主题共 21 个场景、词汇 121 条） | `content/scenarios/*.json` |
| 词频词典 | 30000 个通用词 + 655 个补充词，每词带中英双语释义 | `content/wordlists/frequency.json`（脚本生成） |

**还没有的东西**：

- 项目已在 git 里：2026-11-12 用户建了 GitHub 仓库 https://github.com/a-super-cat/en-words 并推送（初始提交 0c72e36）。提交、推送前仍要先问用户。
- 安卓 App 已起步（2026-11-12 用户决定，见 ROADMAP“移动端”一节）：已加 Capacitor 8.6 的壳和 `android/` 工程，APK 由 GitHub Actions 云端打 debug 包。真机验证进度：朗读已实测——WebView 自带的 `speechSynthesis` 完全没有声音，`src/lib/tts.ts` 已改为原生平台走系统 TTS 插件（`@capacitor-community/text-to-speech`）、网页版不变，真机确认有声但音色机械；2026-11-12 用户选定接 Azure 神经网络语音作为第三条分支（设置里切换引擎，密钥用户自己在 App 里填、只存本机，合成结果缓存在 DB version 4 的 `ttsCache` 表，失败自动回退系统语音），待用户填密钥后验自然度；IndexedDB 持久化和录音还要等用户实测。
- 没有页面的自动化测试，只有纯逻辑的单元测试（70 个）。
- 真实麦克风录音和朗读的声音没有人工验证过（开发时是用脚本和模拟音频流测的）。
- 用户还没有真正开始使用，数据库里没有学习记录。

## 3. 怎么运行

环境：Windows 11，Node 22 以上，npm 10 以上。

```bash
npm install
```

```bash
npm run dev
```

然后打开 http://localhost:5310。

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动开发服务器，端口 5310 |
| `npm run build` | 类型检查 + 生产构建，产物在 `dist/` |
| `npm run preview` | 预览生产构建，也是端口 5310 |
| `npm run typecheck` | 只做类型检查 |
| `npm test` | 跑全部单元测试 |
| `npm run validate` | 校验全部内容文件（词块、面试题、场景） |
| `node scripts/build-wordlist.mjs data/raw/ecdict/ecdict.csv` | 重新生成词频词典 |

**环境里的坑**：

- 这台机器上，Git Bash 里 `cd` 之后运行 `npm`、`npx` 会报 fnm 的错误（`can't find the necessary environment variables`），命令不会执行。**用 PowerShell 运行**。
- 端口 5173（Vite 的默认端口）被用户的另一个项目占用。这是固定用 5310 的原因之一。
- Vite 开发服务器偶尔会漏掉连续的两次文件编辑，继续提供旧版本。表现是：磁盘上的文件是对的，类型检查也通过，但页面报“某某 is not defined”。遇到页面行为和代码对不上时，**重启开发服务器**。

## 4. 技术栈

| 用途 | 选择 | 版本 |
|---|---|---|
| 框架 | Vue 3，全部用 `<script setup lang="ts">` | 3.5 |
| 语言 | TypeScript，严格模式 | 6.0 |
| 构建 | Vite | 8 |
| 状态 | Pinia，全部用 setup 写法 | 4 |
| 路由 | vue-router，hash 模式 | 5 |
| 本地数据库 | IndexedDB，通过 Dexie 访问 | 4 |
| 复习算法 | ts-fsrs（FSRS 的开源实现） | 6 |
| 测试 | Vitest，node 环境 | 5 |
| 样式 | 手写 CSS，没有组件库，没有 Tailwind | — |
| 朗读 | 浏览器自带的 `speechSynthesis` | — |
| 录音 | 浏览器自带的 `MediaRecorder` | — |

没有用任何 UI 组件库、图表库、CSS 框架。不要引入，除非用户同意。

`tsconfig.json` 开了 `noUnusedLocals` 和 `noUnusedParameters`：有没用到的变量或 import，类型检查会失败。

## 5. 目录结构

```
en-words/
  README.md                 使用说明（给用户看）
  AGENTS.md                 给 AI 助手的入口说明：指向本文档，列出最重要的规则
  index.html
  package.json
  vite.config.ts            端口 5310 在这里定义
  tsconfig.json
  .claude/launch.json       Claude 桌面应用的预览配置，别的工具用不到
  docs/
    design.md               方案设计：为什么这样做、每期做了什么
    HANDOFF.md              本文档
    ROADMAP.md              接下来做什么
  content/                  内容，全部是 JSON，会打包进应用
    README.md               词块的编写规范（加词块前必读）
    SPEAKING.md             面试题和场景的编写规范（加题目和场景前必读）
    entries/                词块，文件名 <层>-<分类>-<序号>.json
    questions/              面试题，文件名 q-<分类>.json
    scenarios/              场景剧本，文件名 s-<分类>.json
    wordlists/frequency.json  词频词典，由脚本生成，不要手改
  data/raw/ecdict/          下载的原始词典数据（66 MB），不进版本管理
  scripts/
    validate-content.mjs    校验词块
    validate-speaking.mjs   校验面试题和场景
    build-wordlist.mjs      从 ECDICT 生成词频词典
  src/
    main.ts                 入口：创建应用，加载三个 store 的数据
    App.vue                 顶部导航 + 路由出口
    router.ts               全部路由
    style.css               全局样式和颜色变量（含深色模式）
    types.ts                全部数据类型，改数据结构先看这里
    db.ts                   数据库表定义（Dexie）
    content/                内置内容的加载
      builtin.ts            加载词块，生成条目 id
      speaking.ts           加载面试题和场景，决定分类顺序
      slug.ts               由英文生成 id 的一部分。不要改
    srs/                    复习相关的纯逻辑（有单元测试）
      schedule.ts           封装 ts-fsrs：建卡、评分、排期、产出阶梯
      queue.ts              每日复习队列、新内容分组、日期工具
      prompt.ts             根据卡片状态决定出什么题
      stats.ts              进度、连续天数、复习量预测、学习时长
    speaking/               口语相关的纯逻辑（有单元测试）
      pick.ts               抽题规则、录音保留规则、作答时限
      designGuide.ts        系统设计讲解框架的内容
    vocab/                  词汇相关的纯逻辑（有单元测试）
      dictionary.ts         加载词典、词形还原
      analyze.ts            判断一个词认不认识、分析一段文字的覆盖率
      assess.ts             测评的抽样、提前结束规则、词汇量估算
    stores/                 Pinia store
      app.ts                复习相关的全部状态和操作（最大的文件，447 行）
      speaking.ts           口答记录、STAR 故事、场景练习记录
      vocab.ts              认识标记、阅读记录、测评记录
      backup.ts             备份的导出、导入和清空（组合上面三个 store）
    lib/                    和业务无关的工具
      tts.ts                朗读
      recorder.ts           录音
      keys.ts               页面快捷键
      csv.ts                CSV 解析
      download.ts           下载 JSON 文件
    components/             可复用的组件
      EntryFacts.vue        展示一条词块的全部信息
      EntryDetail.vue       词库里展开的详情（含“我的句子”、暂停、重置）
      ChunkList.vue         一组表达，带勾选框和“加入复习”按钮
      Highlight.vue         在例句里高亮词块
      SpeakButton.vue       朗读按钮
      AudioPlayer.vue       播放一段录音
      BarChart.vue          单序列柱状图
    features/               页面，一个文件一个页面
      TodayView.vue         今日（首页）
      LearnView.vue         新学
      ReviewView.vue        复习
      SpeakListView.vue     口语题库列表
      SpeakView.vue         答一道面试题
      StoriesView.vue       STAR 故事
      DesignGuideView.vue   系统设计讲解框架
      ScenarioListView.vue  场景列表
      ScenarioView.vue      练一个场景
      ReadingView.vue       阅读助手
      VocabView.vue         词汇（测评入口、生词本、分段筛查）
      VocabDrillView.vue    测评和筛查共用的逐词页面
      LibraryView.vue       词库
      StatsView.vue         统计
      SettingsView.vue      设置
```

## 6. 架构

### 6.1 分层

```
页面 (features/*.vue)
   │  调用
   ▼
store (stores/*.ts)  ←── 内置内容 (content/*.json，启动时加载进内存)
   │  调用                     
   ├──► 纯逻辑 (srs/、speaking/、vocab/)   不依赖 Vue 和数据库，有单元测试
   └──► 数据库 (db.ts → IndexedDB)         只存用户产生的数据
```

规则：

- **纯逻辑**放在 `srs/`、`speaking/`、`vocab/` 里，写成纯函数，不引用 Vue、Pinia、数据库。新增逻辑时照这个做，并写单元测试。
- **页面不直接访问数据库**，通过 store 的方法读写。
- **内置内容不进数据库**。它打包在应用里，启动时读进内存。数据库只存：学习状态、复习日志、用户自己加的词条和句子、口答和场景记录、STAR 故事、认识标记、阅读和测评记录、设置。
- 这样内容文件可以随便增加，不影响已有的学习记录。

### 6.2 三个 store

| store | 文件 | 管什么 | 启动时怎么加载 |
|---|---|---|---|
| `useApp` | `stores/app.ts` | 词条、卡片、复习日志、我的句子、设置 | `main.ts` 里调 `app.init()` |
| `useSpeaking` | `stores/speaking.ts` | 口答记录、STAR 故事、场景记录 | `main.ts` 里调 `load()` |
| `useVocab` | `stores/vocab.ts` | 认识/不认识标记、阅读记录、测评记录 | `main.ts` 里调 `load()` |

`useSpeaking` 和 `useVocab` 会调用 `useApp`，反过来不会。跨三个 store 的操作（备份、清空）写在 `stores/backup.ts`。

`App.vue` 在 `app.ready && speaking.ready` 为真之后才渲染页面。

### 6.3 数据库

数据库名 `en-words`，定义在 `src/db.ts`，目前是第 3 版。

| 版本 | 表 | 索引 | 存什么 |
|---|---|---|---|
| 1 | `cards` | `key, entryId, due` | 卡片：一条内容在一个方向上的记忆状态 |
| 1 | `logs` | `++id, at, key` | 每一次评分的日志 |
| 1 | `userEntries` | `id` | 用户自己加的词条，包括生词本里的词 |
| 1 | `notes` | `entryId` | “我的句子” |
| 1 | `kv` | `key` | 目前只有一条：`key='settings'` |
| 2 | `attempts` | `id, questionId, at` | 口答记录（可能带录音 Blob） |
| 2 | `stories` | `id` | STAR 故事 |
| 2 | `runs` | `id, scenarioId, at` | 场景练习记录 |
| 3 | `marks` | `word` | 单词的认识/不认识标记 |
| 3 | `readings` | `id, at` | 阅读记录 |
| 3 | `assessments` | `id, at` | 测评记录 |

所有类型定义在 `src/types.ts`。

### 6.4 路由

hash 模式，定义在 `src/router.ts`。

| 路径 | 页面 |
|---|---|
| `/` | 今日 |
| `/learn`、`/learn?extra=1` | 新学；带 `extra=1` 表示超出当天配额再学一组 |
| `/review` | 复习 |
| `/speak` | 口语题库 |
| `/speak/stories` | STAR 故事 |
| `/speak/system-design` | 系统设计讲解框架 |
| `/speak/:id` | 答一道题，`id` 是题目的 id |
| `/scenarios`、`/scenarios/:id` | 场景列表、练一个场景 |
| `/reading` | 阅读助手 |
| `/vocab` | 词汇 |
| `/vocab/assess` | 词汇量测评 |
| `/vocab/triage/:band` | 分段筛查，`band` 是第几个频段（从 1 开始） |
| `/library`、`/library?q=词` | 词库；`q` 是搜索词 |
| `/stats` | 统计 |
| `/settings` | 设置 |

注意：`/speak/stories` 和 `/speak/system-design` 必须写在 `/speak/:id` **前面**，否则会被当成题目 id。

`App.vue` 里的 `<RouterView :key="$route.path" />`：路径变了就重建页面。这是有意的，从一道题跳到另一道题时，计时和录音状态要从头开始。

## 7. 核心规则

这一节是业务逻辑的精确描述。改相关代码前必须读懂。

### 7.1 词条（Entry）

- 四层：`A` 通用核心、`B` 职场沟通、`C` 技术和面试、`D` 学术书面。
- 每条属于一个分类。分类的 key 是 `<小写的层>.<分类名>`，例如 `c.react`。
- **条目 id** = `<分类 key>.<slug(英文)>`，例如 `c.arch-distributed.single-point-of-failure`。它在 `src/content/builtin.ts` 里生成。
- 学习记录靠这个 id 关联。所以**改一条已有词条的英文，或者改 `slug` 函数，会让它的学习记录对不上**。可以改中文、例句、备注。
- 来源有两种：`builtin`（内容文件里的）和 `user`（用户自己加的，存在数据库 `userEntries` 表）。
- 用户自己加的有两种分类：`<层>.mine`（标题“我的词条”，手动添加）和 `<层>.vocab`（标题“生词本”，从测评、筛查、阅读里收的）。

### 7.2 卡片（CardState）

- 一条词条最多有两张卡：`recognize`（认读）和 `produce`（中译英）。
- 卡片的 key = `<条目 id>|<方向>`。
- **D 层只有认读卡**，没有产出卡。
- 没有任何卡的词条是“未学”。
- 排期用 FSRS，配置在 `src/srs/schedule.ts`：目标保持率 0.9，最长间隔 365 天，开启随机抖动，**关闭了分钟级的学习步骤**（`enable_short_term: false`）。关闭的原因：这个工具一天只打开一次，不适合“1 分钟后再考”这种步骤。
- 新卡第一次评分后的间隔大约是：忘了 1 天、记得 3 天、很熟 7 天。

### 7.3 新学流程（`LearnView.vue` + `app.learnGroup`）

1. 每组 5 条，来自同一个分类。逐条展示（听读音、看例句）。用户可以按 K 标记“已经会了”。
2. 一组看完马上小测：显示中文，用户说英文，然后自评“说对了”或“没说对”。说错的排到最后再考，直到说对。D 层的词小测时显示英文，考意思。
3. 小测结束才建卡。**中途退出，这一组不保存**。建卡规则：

| 情况 | 认读卡的评分 | 产出卡的评分 |
|---|---|---|
| 标了“已经会了” | 很熟（4） | 很熟（4） |
| 小测一次说对 | 记得（3） | 记得（3） |
| 小测说错过 | 记得（3） | 忘了（1） |

4. 每天新学多少条：设置里的 `newPerDay`，默认 20，即 4 组。
5. 选哪几组（`pickNewGroups`，在 `src/srs/queue.ts`）：每 4 组按 `C、B、C、A 或 D` 的顺序轮转。某层没有可学的内容时，由其他层补上。同一层内优先轮到学得最少的分类。

### 7.4 复习流程（`ReviewView.vue` + `app.rate`）

1. 队列（`buildReviewQueue`）：今天之内到期的卡都算到期。超过每日上限（默认 120）时保留拖得最久的。**产出卡排在认读卡前面**，各自内部打乱。
2. 出什么题（`buildPrompt`，在 `src/srs/prompt.ts`）。产出卡按记忆稳定度分三级：

| 稳定度 | 题型 | 题面 | 时限 |
|---|---|---|---|
| 小于 4 天 | 提示回忆 `cue` | 中文提示 | 5 秒 |
| 4 到 15 天 | 整句翻译 `sentence` | 例句的中文 | 10 秒 |
| 15 天以上 | 情境应答 `situation` | 情境描述 | 15 秒 |

   - 缺少情境时退回整句翻译；缺少可用的例句时退回提示回忆。
   - 用户写了“我的句子”时，整句翻译优先考它。
   - 例句没有中文（生词本里从阅读收来的词）时，不能出整句翻译题。
   - 认读卡：显示英文和例句，回想意思。**B 层的认读卡每 3 次里有 1 次改成只听读音**（`reps % 3 === 2` 时）。
3. 用户按空格看答案，再按 1–4 自评。超过时限会提示建议评“困难”。
4. **说得出就算认得**：产出卡评为 3 或 4 时，同一条当天到期的认读卡自动按 3 评分，并从队列里拿掉。
5. **再练一遍**：评为 1 的条目会追加到队列最后，只练不计分，说对为止。
6. **顽固条目**：累计忘记次数达到 4 的倍数时自动暂停（`suspended` 和 `leech` 都置为 true），不再出题，直到用户在词库里点“恢复复习”。
7. 支持撤销上一次评分（按 Z）。
8. 复习时长达到上限（默认 25 分钟）时提示一次，用户可以继续或结束。

### 7.5 口语（`SpeakView.vue`）

1. 一道题答两遍：第 1 遍限时 120 秒，第 2 遍限时 90 秒（`ROUND_SECONDS`，在 `src/speaking/pick.ts`）。
2. 打开题目时自动朗读题目。
3. 每遍：点“开始回答”→ 计时并录音 → 点“说完了”或时间到 → 回听、看提纲、勾选用上的表达、选流利度（1–5）、记下卡住的地方 → 保存。
4. 提纲在第 1 遍答完之后才显示。
5. 拿不到麦克风或录音失败时照常计时，只是不能回听。
6. 录音只保留最近 20 次（`KEEP_AUDIO`），更早的录音会被清掉，记录本身保留。
7. 抽题规则（`pickNext`）：先选最久没练的分类（没练过的最优先），再在分类里选没练过的题。场景用同一个函数。
8. 题目页会带出最多 3 条“学过的相关表达”（P2-1，2026-11-13）：`pickLearnedChunks` 按题目分类查 `QUESTION_ENTRY_CATEGORIES` 对应表，只选有产出卡、没暂停、复习过至少一次的词块，按稳定度取前 3。回听自评时可与题目自带表达一起勾选，勾选只记进口答记录的 `used`，**不影响复习排期**（第一版的边界，不要顺手改）。
8. 分类的显示顺序在 `src/content/speaking.ts` 的 `QUESTION_ORDER` 和 `SCENARIO_ORDER` 里。**新增分类时要把它加进去**，否则排在最后。

### 7.6 场景（`ScenarioView.vue`）

- 逐轮进行。同事的话（`speaker: 'them'`）：自动朗读，默认不显示原文，按 T 看原文。
- 轮到用户（`speaker: 'me'`）：显示中文意图，用户开口说，按空格看参考说法，再自评“说出来了”或“没说出来”。
- 自评只用于结束时的统计，不进入间隔重复。

### 7.7 “加入复习”（`app.addChunk`）

面试题和场景里的表达可以一键加入复习：

- 词库里有同名词条：直接用它。
- 词库里没有：建成用户词条（面试题里的归 C 层，场景里的归 B 层）。
- 然后按“小测说错过”建卡，明天开始出题。

### 7.8 词汇和阅读

**词典**（`src/vocab/dictionary.ts`）：

- `ranked`：30000 个通用词，按词频排序，排名从 1 开始。
- 补充词没有排名（`rank: null`）。带计算机义项的标记为 `tech: true`。
- `resolve(token)`：把文中的词还原成词典里的原形。先查词条和变形表；一个词既是词条又是变形时取词频更高的；再处理缩写（don't → do）；最后按词尾规则猜。

**判断一个词认不认识**（`statusOf`，在 `src/vocab/analyze.ts`），按这个优先级：

1. 复习里已掌握 → 认识
2. 在生词本里，或者有卡但没掌握 → 学习中
3. 用户手动标过 → 按标记
4. 词典里没有 → 词典外
5. 技术补充词 → 认识
6. 词频排名 ≤ `settings.knownRank` → 认识，否则 → 生词

`knownRank` 默认 3000，测评会更新它，用户也可以在词汇页手动改。

**覆盖率** = 认识的词数 ÷ 词典里查得到的词数。词典外的词不计入；“学习中”不算认识。

**测评**（`src/vocab/assess.ts`）：每 1000 词一段，每段抽 10 个，从第 1 段开始。连续两段认识的比例不超过 20% 就结束，最多 15 段。词汇量 = 各段比例 × 1000 之和。`knownRank` = 从第 1 段起连续达到 80% 的段数 × 1000，最少 1000。

**生词本**（`app.addVocabWords`）：词频排名 ≤ 3000 的归 A 层（`a.vocab`），其余归 D 层（`d.vocab`）。从阅读里收的词带上原句作例句（例句的中文是空的）。

### 7.9 备份格式

```ts
{
  app: 'en-words',
  version: 1,
  exportedAt: string,
  cards, logs, userEntries, notes, settings,   // M1
  speaking?: { attempts, stories, runs },      // M2 加的，attempts 里不含录音
  vocab?: { marks, readings, assessments },    // M3 加的
}
```

后加的部分都是可选字段，这样旧备份还能导入。**以后再加数据，也用新增可选字段的方式，不要改 `version`**，除非旧字段的含义变了。

## 8. 常见任务怎么做

### 8.1 加一批词块

1. 读 `content/README.md`，严格按格式写。
2. 新建 `content/entries/<层>-<分类>-<序号>.json`。同一分类可以有多个文件，`layer`、`category`、`title` 保持一致。
3. 每个文件最多 50 条。按顺序每 5 条主题相近（应用按 5 条一组学习）。
4. 运行 `npm run validate`。有 error 必须改。“term 重复”的 error 表示这个英文在别的文件里已经有了，换一个或删掉。
5. 运行 `npx vitest run`（有一个测试检查全部 id 唯一）。
6. 不需要改任何代码，新分类会自动出现在界面上。

### 8.2 加面试题或场景

1. 读 `content/SPEAKING.md`。
2. 面试题写进 `content/questions/q-<分类>.json`，场景写进 `content/scenarios/s-<分类>.json`。一个分类一个文件。
3. 新分类要加进 `src/content/speaking.ts` 的 `QUESTION_ORDER` 或 `SCENARIO_ORDER`。
4. 运行 `npm run validate`。

### 8.3 加一个设置项

1. 在 `src/types.ts` 的 `Settings` 接口里加字段。
2. 在 `src/stores/app.ts` 的 `DEFAULTS` 里加默认值。
3. 在 `src/features/SettingsView.vue` 里加控件，通过 `app.updateSettings({ 字段: 值 })` 保存。
4. 不需要改数据库。旧的设置记录缺这个字段时，会用默认值补上。

### 8.4 加一张数据库表

1. 在 `src/types.ts` 里定义类型。
2. 在 `src/db.ts` 里：加一行 `表名!: Table<类型, 主键类型>;`，并在构造函数里**新增** `this.version(4).stores({ 表名: '主键, 索引' })`。只写新表，旧表不用重复写。
3. 在对应的 store 里加读写方法。
4. 如果这张表的数据要进备份：在那个 store 的 `exportData` 和 `importData` 里加上，并在 `clearHistory` 里决定清不清。

### 8.5 加一个页面

1. 新建 `src/features/XxxView.vue`，用 `<script setup lang="ts">`。
2. 在 `src/router.ts` 里加路由。
3. 需要出现在导航里的话，在 `src/App.vue` 里加 `<RouterLink>`。有子页面的加 `class="section"`，这样在子页面里导航项也保持高亮。
4. 页面的快捷键用 `src/lib/keys.ts` 的 `useHotkeys`。

### 8.6 调整复习算法的参数

- 目标保持率、最长间隔：`src/srs/schedule.ts` 里的 `fsrs({...})`。
- 产出阶梯的门槛：同一文件的 `STAGE_DAYS`。
- 各题型的时限：`src/srs/prompt.ts` 的 `LIMIT_SEC`。
- “已掌握”的门槛：`src/srs/stats.ts` 的 `MATURE_DAYS`。
- 改完要跑 `npx vitest run`。`schedule.test.ts` 里有依赖这些数值的测试，需要一起更新。

### 8.7 重新生成词典

1. 确认 `data/raw/ecdict/ecdict.csv` 存在。不存在的话要从 https://github.com/skywind3000/ECDICT 下载（66 MB，**下载前要先问用户**）。
2. 运行 `node scripts/build-wordlist.mjs data/raw/ecdict/ecdict.csv`。
3. 补充词的一部分来自内置内容里出现过的词，所以**加了大量新内容之后可以重新生成一次**。
4. 运行 `npx vitest run`。

## 9. 容易踩的坑

每一条都真实发生过，或者有明确的后果。

### 9.1 端口必须是 5310

学习记录存在浏览器的 IndexedDB 里，而 IndexedDB 按“地址 + 端口”隔离。端口一变，用户看到的就是一份空数据，会以为记录丢了。`vite.config.ts` 里开了 `strictPort: true`：端口被占用时直接报错，不会自动换端口。不要关掉它。

### 9.2 往 IndexedDB 存数据前，要复制成普通对象

Vue 的 `ref`、`reactive` 里的对象是 Proxy，IndexedDB 存不了，会报 `DataCloneError`。这个错误是异步抛出的，页面上看不到，只在控制台里。

```ts
// 错：results 是 ref 数组，里面的对象是 Proxy
await db.assessments.put({ bands: [...results.value] });

// 对：逐个复制成普通对象
await db.assessments.put({ bands: results.value.map((r) => ({ ...r })) });

// reactive 对象用 toRaw，里面的数组也要复制
const plain = { ...toRaw(settings), disabledCategories: [...settings.disabledCategories] };
```

store 里的 `cards`、`notes`、`marks` 用的是 `shallowReactive(new Map())`：Map 本身是响应式的，里面存的是普通对象，可以直接存数据库。**更新时要整体替换对象**（`cards.set(key, 新对象)`），不要改已有对象的属性，否则界面不会更新。

### 9.3 数据库版本只增不改

Dexie 靠版本号决定要不要升级。改了已有的 `version(n).stores(...)`，已经装了旧版本的浏览器不会重新建表，会出错。永远是新增 `version(n+1)`。

### 9.4 不要直接 import 词典 JSON

`frequency.json` 有 4.2 MB（含每个词的英文释义）。直接 `import` 它，TypeScript 会去解析整个文件来推断类型，类型检查会变得极慢；它还会被打进首屏的包里。`src/vocab/dictionary.ts` 的 `loadDictionary()` 用 `import.meta.glob` 按需加载，并且只加载一次。需要词典的页面都这样用：

```ts
const dict = shallowRef<Dictionary | null>(null);
onMounted(async () => (dict.value = await loadDictionary()));
```

### 9.5 测试时不要破坏用户数据

用户的全部学习记录都在浏览器里，没有服务器备份。在浏览器里验证功能时：

1. **先看**库里有没有用户的数据（卡片数、口答记录数等）。
2. 有数据时，先在设置页导出备份，或者只做不产生数据的验证。
3. 测试造出来的数据，结束后清掉，并把改过的设置改回去。
4. 不要调用 `clearAllProgress()` 或删除数据库，除非确认库里只有测试数据。

### 9.6 快捷键

`useHotkeys` 在输入框里打字时、按着 Ctrl/Alt/Meta 时不触发。空格键传给处理函数的是字符串 `'Space'`，其他键是小写（`'enter'`、`'z'`）。

鼠标点过的按钮会留着焦点，之后按空格会再次触发它。所以换题时要调 `dropFocus()`。

### 9.7 朗读和录音都可能不可用

- `ttsSupported` 为 false 时不能朗读。听辨题不会出现，场景里同事的话直接显示原文。
- 录音：`useRecorder().start()` 返回 false 表示没录上（没权限、不支持、设备被占用）。调用方要照常继续，不能卡住流程。

### 9.8 内容的质量规则

写内容时最容易犯的错：

- `zh`（中文提示）里出现了英文答案。它是“中译英”题的题面，不能泄露答案。
- `zh` 不能唯一指向这个英文。中文对应多个常见说法时，要加区分提示，例如“缓解（风险），m 开头”。
- 例句里没有用到这个词块。
- 场景里用户发言的 `zh` 写成了参考说法的逐字翻译。它应该是“你想表达的意思”，例如“你解释进度落后的原因……”。

校验脚本能查出一部分，查不出全部，写完要自己读一遍。

### 9.9 代码和文字的风格

- 界面文字全部是中文，句子完整，不用“→”这类符号代替文字。
- 注释用中文，写**为什么**这样做，不写代码字面上在做什么。
- 魔法数字提成常量并加注释（看 `src/srs/schedule.ts` 的写法）。
- 不要为了“以后可能用到”加抽象。现有代码里没有多余的层。
- 样式用 `style.css` 里的 CSS 变量（`--surface`、`--muted`、`--accent` 等），不要写死颜色，否则深色模式会出问题。

### 9.10 用量和并行

如果你是能启动子代理的 AI：这个项目曾经一次并行启动 13 个子代理写内容，把用户的用量限额耗尽，全部中途失败。一次不要超过 4 个，启动前告诉用户大概的消耗。

### 9.11 需要先问用户的事

- 下载任何文件。
- `git init`、提交、推送。
- 引入新的依赖（尤其是 UI 库、图表库）。
- 任何会清空或迁移用户数据的操作。
- 接入需要 API Key 或联网的服务。

## 10. 怎么验证

### 10.1 自动检查

第 0 节的四条命令。全部通过是最低要求。

### 10.2 在浏览器里手工验证

改了哪个页面就走一遍那个页面的流程。各页面的关键路径：

| 页面 | 要走通的路径 |
|---|---|
| 新学 | 看完一组 → 小测（故意说错一个）→ 这一组结束后今日页的“已学”增加 |
| 复习 | 说完看答案 → 评分 → 撤销 → 再评 → 评一个“忘了”→ 最后出现“再练一遍”→ 结束汇总 |
| 口语 | 开始回答 → 说完了 → 勾选、选流利度 → 保存再答一遍 → 第二遍 → 结束汇总；再次进入能看到历史 |
| 场景 | 听同事的话 → 看原文 → 轮到自己 → 看参考 → 自评 → 走到结束 |
| 阅读 | 粘贴文字 → 分析 → 点一个生词 → 收进生词本（状态变成“学习中”）→ 标一个“认识”→ 覆盖率变化 |
| 词汇 | 测评走完 → 结果保存、词汇页显示词汇量 → 筛查一批 → 生词本数量增加 |
| 设置 | 导出备份 → 导入同一个文件 → 数据不变 |

### 10.3 验证时有用的技巧

在浏览器控制台里可以直接拿到 store：

```js
const stores = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s;
const app = stores.get('app');
const speaking = stores.get('speaking');
const vocab = stores.get('vocab');
app.cards.size;            // 卡片数
app.settings.knownRank;    // 设置
```

想测复习但没有到期的卡：新学一组后，把卡片的到期时间改到过去，再刷新页面。

想测录音但不想弹麦克风权限：用程序生成的音频流替换 `getUserMedia`。

```js
navigator.mediaDevices.getUserMedia = async () => {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const dest = ctx.createMediaStreamDestination();
  osc.connect(dest);
  osc.start();
  return dest.stream;
};
```

## 11. 已知问题

按影响从大到小排列。对应的改进任务在 [ROADMAP.md](ROADMAP.md) 里。

| # | 问题 | 位置 |
|---|---|---|
| 1 | 真实麦克风录音、朗读的声音没有人工验证过 | `lib/recorder.ts`、`lib/tts.ts` |
| 2 | 词典的释义来自通用词典，技术词的日常义项问题已建人工覆盖表（`content/wordlists/overrides.json`，86 个高频技术词）且阅读助手优先显示词库词条的中文；覆盖表之外的长尾技术词仍可能给日常义项，遇到再往覆盖表里加 | `content/wordlists/frequency.json`、`content/wordlists/overrides.json` |
| 3 | 内容没有逐条审校。子代理写的，只抽查过。Java 分类里有几条的中文提示保留了英文关键字（volatile、Optional 等），等于提示了部分答案 | `content/entries/c-java-*.json` |
| 4 | 阅读助手的 `analyze` 已实测不慢（5031 词首次分析 8.3ms、标记后重分析平均 8.8ms，2026-11-12 Node 环境测量）；未测的是浏览器渲染上万个片段时的帧率，几千词长文若卡顿再做分段渲染 | `features/ReadingView.vue` |
| 5 | 第 2 批词块去重时删了 22 条，这些分类里“每 5 条主题相近”的分组错开了几条 | 多个 `content/entries` 文件 |
| 6 | 生产构建的主包 1.1 MB（内容都打在里面），词典 2.6 MB（按需加载）。本地使用没影响 | — |
| 7 | 没有页面的自动化测试 | — |
| 8 | 安卓 App 真机验证未完：系统 TTS 已确认有声（音色机械），Azure 分支（v0.3.0）待用户填密钥验自然度；IndexedDB 持久化和录音回听尚未实测 | `android/`、`src/lib/tts.ts`、`src/lib/recorder.ts` |

## 12. 文档清单

| 文档 | 内容 | 什么时候更新 |
|---|---|---|
| `README.md` | 给用户的使用说明、快捷键 | 功能或快捷键变了 |
| `docs/design.md` | 方案设计、每期的实现细节和偏离 | 做了设计上的决定 |
| `docs/HANDOFF.md` | 本文档 | 架构、规则、坑有变化 |
| `docs/ROADMAP.md` | 接下来做什么 | 完成或新增任务 |
| `content/README.md` | 词块的编写规范 | 词块格式变了 |
| `content/SPEAKING.md` | 面试题和场景的编写规范 | 这两种格式变了 |

改了代码，对应的文档要一起改。文档和代码不一致时，以代码为准，并把文档改对。
