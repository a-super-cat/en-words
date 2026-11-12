# 内容编写规范

学习者：母语中文的高级全栈工程师（React / Vue / Python / Java / Rust / Node.js），目标是英文技术面试、和英文同事日常协作、读懂技术书。

内容是“词块”，不是单词表。每条都要是高级工程师在面试或工作里真的会说的话。

## 文件

- 位置：`content/entries/<layer>-<category>[-<n>].json`，例如 `c-interview-1.json`。
- 每个文件最多 50 条。同一分类可以拆成多个文件（`-1`、`-2`），`layer` 和 `category` 保持一致即可。
- 编码 UTF-8，不带 BOM。

```json
{
  "layer": "C",
  "category": "arch-distributed",
  "title": "架构：分布式与扩展性",
  "entries": [
    {
      "term": "single point of failure",
      "kind": "chunk",
      "zh": "单点故障",
      "examples": [
        {
          "en": "The primary database was a single point of failure, so we added a replica.",
          "zh": "主库是单点故障，所以我们加了一个副本。"
        }
      ],
      "situation": {
        "zh": "面试官问：你们旧架构最大的风险是什么？",
        "en": "The biggest risk was that the primary database was a single point of failure."
      },
      "note": "缩写 SPOF 多见于书面，口头一般说全称。"
    }
  ]
}
```

## 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `term` | 是 | 英文词块。小写开头，除非是专有名词或整句。句型里的空位用 `...` |
| `kind` | 是 | `word` 单词；`chunk` 搭配或短语；`sentence` 整句或句型 |
| `zh` | 是 | 中文提示，尽量短。它是“中译英”题的题面，必须能唯一指向 `term` |
| `examples` | B、C 层必填 | 1–2 个例句。第一个会作为“整句翻译”题，`en` 不超过 22 个词 |
| `situation` | B、C 层必填 | 情境题。`zh` 是情境或提问，`en` 是 1–2 句参考回答，必须用上 `term` |
| `register` | 否 | `formal` / `neutral` / `casual`，不写表示 `neutral` |
| `note` | 否 | 中文。只在有用时写：易错点、语气、近义词区别、发音提醒 |
| `ipa` | 否 | 只给中国工程师常读错的词，例如 cache、queue、idempotent。没把握就不写 |
| `collocations` | 否 | 常见搭配，字符串数组 |

不允许出现其他字段。

## 质量要求

1. **`zh` 必须能唯一指向 `term`**。如果中文对应多个常见英文说法，在括号里加区分提示，例如 `缓解（风险），m 开头`、`权衡（名词）`。不要把英文答案直接写进 `zh`。
2. **例句要像真人说的话**。用第一人称讲项目经历、方案取舍、会议发言，不要教科书定义句。例句里必须出现 `term`（允许时态和单复数变化）。
3. **`zh` 翻译要是自然的中文**，技术名词按国内工程师的习惯说法（例如“主库”“灰度发布”“回滚”）。
4. **`situation.zh` 不能泄露答案**。写成“面试官问：……”“站会上你想说：……”“同事在 PR 里……你想回复：……”这样的情境，不要出现 `term` 的英文。
5. **顺序**：重要和高频的排在前面。应用按文件顺序每 5 条一组学习，所以每连续 5 条应当主题相近。
6. **不要重复**。同一个 `term` 在全部文件里只能出现一次。
7. 技术内容必须准确。拿不准的说法不要写。

## 校验

```bash
node scripts/validate-content.mjs content/entries/c-interview-1.json
```

不带参数时检查全部文件。有 error 必须改掉，warning 要逐条看一遍。
