# 面试题和场景剧本的编写规范

学习者：母语中文的高级全栈工程师（React / Vue / Python / Java / Rust / Node.js），目标是英文技术面试、和英文同事日常协作。

词块的规范见 [README.md](README.md)。这里是口语练习用的两类内容。

## 面试题

位置：`content/questions/q-<category>.json`，一个分类一个文件。

```json
{
  "category": "system-design",
  "title": "系统设计",
  "questions": [
    {
      "id": "url-shortener",
      "prompt": "How would you design a URL shortening service like Bitly?",
      "zh": "你会怎么设计一个类似 Bitly 的短链接服务？",
      "outline": [
        "Clarify scale: new links per day, read-to-write ratio",
        "Generate short keys: counter plus base62, avoid collisions",
        "Store mappings in a key-value store, cache hot links",
        "Redirect path must be fast: cache first, then database",
        "Mention trade-offs: custom aliases, expiry, analytics"
      ],
      "chunks": [
        { "term": "read-heavy", "zh": "读多写少" },
        { "term": "cache hit ratio", "zh": "缓存命中率" },
        { "term": "single point of failure", "zh": "单点故障" },
        { "term": "The trade-off here is ...", "zh": "这里的取舍是……" }
      ],
      "followUps": ["How would you handle a link that suddenly goes viral?"]
    }
  ]
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 小写字母、数字和连字符。在全部题目里唯一 |
| `prompt` | 是 | 英文。面试官真实会问的原话，1–2 句 |
| `zh` | 是 | 题目的中文意思 |
| `outline` | 是 | 3–5 条英文提纲，每条不超过 14 个词。是回答要点，不是逐字稿 |
| `chunks` | 是 | 4–6 个值得在回答里用上的表达，每个有 `term` 和 `zh` |
| `followUps` | 否 | 0–2 个英文追问 |

要求：

1. 题目要是高级工程师面试里真的会被问到的，不要初级题（例如“什么是闭包”）。技术题问原理、取舍和经验，不问定义。
2. 提纲只给要点和方向，适用于大多数候选人，不要编造具体的个人经历。行为题的提纲按 STAR 给结构提示。
3. `chunks` 优先选词库里已有的词块，`term` 要和 `content/entries/` 里的写法逐字一致（可以用搜索确认）。词库里没有合适的再自己写。
4. 一个分类里的题目不要互相重复，角度要分散。

## 场景剧本

位置：`content/scenarios/s-<category>.json`，一个分类一个文件。

```json
{
  "category": "standup",
  "title": "站会",
  "scenarios": [
    {
      "id": "blocked-on-api",
      "title": "被后端接口卡住",
      "setting": "周二早上的站会。你在重构结算页，但依赖的后端接口还没好。主持站会的是经理 Sarah，后端同事是 Raj。",
      "turns": [
        {
          "speaker": "them",
          "name": "Sarah",
          "en": "Morning, everyone. Let's keep it quick today. Who wants to go first?",
          "zh": "大家早。今天咱们快点过。谁先来？"
        },
        {
          "speaker": "me",
          "zh": "你主动先说：昨天把结算页的表单校验做完了，今天本来要接价格接口，但接口还没好，你被卡住了。",
          "en": "I can go. Yesterday I finished the form validation on the checkout page. Today I was going to hook up the pricing API, but it isn't ready yet, so I'm blocked on that.",
          "chunks": [
            { "term": "hook up", "zh": "接上、对接" },
            { "term": "blocked on", "zh": "被……卡住" }
          ]
        }
      ]
    }
  ]
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 小写字母、数字和连字符。在全部场景里唯一 |
| `title` | 是 | 中文短标题 |
| `setting` | 是 | 中文，2–3 句：时间地点、在场的人、你的处境或目的 |
| `turns` | 是 | 8–12 轮。第一轮由对方开口。其中你的发言 4–6 轮 |
| `turns[].speaker` | 是 | `them`（同事）或 `me`（学习者） |
| `turns[].name` | 对方必填 | 同事的名字，同一场景里保持一致 |
| `turns[].en` | 是 | 对方的原话，或你的参考说法。1–3 句 |
| `turns[].zh` | 是 | 对方：中文意思。你：见下面第 2 条 |
| `turns[].chunks` | 你的发言必填 | 1–3 个参考说法里值得记的表达，每个有 `term` 和 `zh` |

要求：

1. 对方的话要像真实同事说的英文：有省略、口头语和自然的衔接，不要教科书腔。可以有不同口吻的同事（直接的、啰嗦的、客气的）。
2. 你的发言里，`zh` 写的是“你想表达的意思”，用第二人称描述意图（“你想说……”“你解释……”），不要写成参考说法的逐字翻译，也不能出现英文答案。学习者看着它开口，再对照 `en`。
3. 参考说法要是高级工程师得体的说法，长度适合一口气说完。`chunks` 里的 `term` 必须出现在这一轮的 `en` 里（允许时态和单复数变化）。
4. 对话要有来有回、有一点张力（分歧、追问、意外情况），不要只是轮流念稿。结尾要自然收住。
5. `chunks` 优先选词库里已有的词块，`term` 和 `content/entries/` 里的写法逐字一致。

## 校验

```bash
node scripts/validate-speaking.mjs
```

可以带文件名只看某几个文件的问题。有 error 必须改掉，warning 逐条检查。
