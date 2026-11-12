<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import SpeakButton from '../components/SpeakButton.vue';
import { decompose, formatParts } from '../lib/morphology';
import { getWordNote } from '../lib/wordNotes';
import { useApp } from '../stores/app';
import { useVocab } from '../stores/vocab';
import { analyze, sentenceAt, type Segment, type UnknownWord, type WordStatus } from '../vocab/analyze';
import { loadDictionary, type Dictionary } from '../vocab/dictionary';

/** 生词列表默认只显示前这么多个 */
const LIST_PAGE = 30;
const STATUS_LABEL: Record<WordStatus, string> = {
  known: '认识',
  learning: '学习中',
  unknown: '生词',
  offlist: '词典里没有',
};

const vocab = useVocab();
const app = useApp();
const dict = shallowRef<Dictionary | null>(null);
onMounted(async () => (dict.value = await loadDictionary()));

const draft = ref('');
const title = ref('');
/** 正在分析的原文。分析结果随“认识/不认识”的标记实时更新。 */
const text = ref('');
const readingId = ref('');
const added = ref(0);
const selected = shallowRef<Segment | null>(null);
/** 词库里有同名词条时优先显示词库的中文（那是给技术场景写的，比通用词典准） */
const selectedEntry = computed(() => (selected.value?.key ? app.byTerm.get(selected.value.key) : undefined));
/** 构词拆解（词根词缀）：拆得出才显示，拆不出不硬凑 */
const selectedMorph = computed(() => {
  const w = selected.value?.word;
  if (!w || !dict.value) return null;
  const d = dict.value;
  const parts = decompose(w.word, {
    isWord: (stem) => d.resolve(stem) !== undefined,
    glossOf: (stem) => d.resolve(stem)?.zh,
  });
  return parts ? formatParts(parts) : null;
});
/** 单词详解二期的人工内容（词源、搭配、场景例句），目前只覆盖高频技术词 */
const selectedNote = computed(() => (selected.value?.word ? getWordNote(selected.value.word.word) : undefined));
/** Etymonline 词源页链接：站方挡嵌入和抓取，只能跳转到它的页面看全文 */
const selectedEtymUrl = computed(() => {
  const w = selected.value?.word?.word;
  return w ? `https://www.etymonline.com/word/${encodeURIComponent(w.toLowerCase())}` : null;
});
const showAll = ref(false);

const analysis = computed(() => (dict.value && text.value ? analyze(text.value, dict.value, vocab.model) : null));
const pct = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;
const fmtDate = (t: number) => new Date(t).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });

const fresh = computed(() => analysis.value?.unknown.filter((u) => u.status === 'unknown') ?? []);
const repeated = computed(() => fresh.value.filter((u) => u.count >= 2));
const listed = computed(() => (showAll.value ? fresh.value : fresh.value.slice(0, LIST_PAGE)));
// 选中的词在最新分析结果里的状态（加入生词本或标成认识后会变）
const selectedStatus = computed(() => {
  const s = selected.value;
  return s && analysis.value?.segments.find((x) => x.start === s.start)?.status;
});
const history = computed(() => [...vocab.readings].reverse());

async function record() {
  const a = analysis.value;
  if (!a) return;
  await vocab.saveReading({
    id: readingId.value,
    at: Number(readingId.value),
    title: title.value.trim() || text.value.slice(0, 40).replace(/\s+/g, ' '),
    words: a.total,
    coverage: a.coverage,
    unknown: fresh.value.length,
    added: added.value,
  });
}

async function run() {
  if (!dict.value || !draft.value.trim()) return;
  text.value = draft.value.trim();
  readingId.value = String(Date.now());
  added.value = 0;
  selected.value = null;
  showAll.value = false;
  await record();
}

/** 只更新这次阅读“收了几个词”，覆盖率和生词数保留分析当时的值 */
async function bumpAdded(n: number) {
  if (n === 0) return;
  added.value += n;
  const saved = vocab.readings.find((r) => r.id === readingId.value);
  if (saved) await vocab.saveReading({ ...saved, added: added.value });
}

const collect = async (items: UnknownWord[]) =>
  bumpAdded(await vocab.collect(items.map((u) => ({ word: u.word, sentence: u.sentence }))));

async function collectSelected() {
  const s = selected.value;
  if (s?.word && s.start !== undefined) {
    await bumpAdded(await vocab.collect([{ word: s.word, sentence: sentenceAt(text.value, s.start) }]));
  }
}

function reset() {
  text.value = '';
  selected.value = null;
}
</script>

<template>
  <div class="stack">
    <h1>阅读助手</h1>

    <p v-if="!dict" class="muted">正在加载词典…</p>

    <section v-else-if="!text" class="panel stack">
      <p class="muted small">
        粘贴一段正在读的英文（文档、书的一节、论文段落）。工具会算出你认识其中多大比例的词，标出生词，点一下就能看释义、收进生词本。原文不会被保存。
      </p>
      <input v-model="title" type="text" placeholder="标题（可不填），例如 DDIA 第 5 章" />
      <textarea v-model="draft" rows="12" placeholder="把英文粘贴到这里" />
      <div><button type="button" class="primary" :disabled="!draft.trim()" @click="run">分析</button></div>
    </section>

    <template v-else-if="analysis">
      <section class="panel stack">
        <div class="row between">
          <div class="stats">
            <div>
              <div class="num">{{ pct(analysis.coverage) }}</div>
              <div class="muted small">认识的词占比</div>
            </div>
            <div>
              <div class="num">{{ fresh.length }}</div>
              <div class="muted small">生词（不重复）</div>
            </div>
            <div>
              <div class="num">{{ analysis.total }}</div>
              <div class="muted small">总词数</div>
            </div>
          </div>
          <button type="button" @click="reset">换一段</button>
        </div>
        <p class="muted small">
          认识 98% 以上的词才能不查词典顺畅地读；95% 左右能读懂大意但比较吃力。
          <template v-if="analysis.offlist.length > 0">
            另有 {{ analysis.offlist.length }} 个词典里没有的词（专有名词、很新的术语等）没有计入。
          </template>
          <template v-if="added > 0"> 这一篇已经收了 {{ added }} 个词。</template>
        </p>
      </section>

      <section v-if="selected" class="panel stack picked" aria-live="polite">
        <div class="row">
          <span class="term">{{ selected.word?.word ?? selected.text }}</span>
          <SpeakButton :text="selected.word?.word ?? selected.text" />
          <span v-if="selected.word?.phonetic" class="muted">/{{ selected.word.phonetic }}/</span>
          <span v-if="selectedStatus" class="badge">{{ STATUS_LABEL[selectedStatus] }}</span>
          <span v-if="selected.word?.rank" class="muted small">词频第 {{ selected.word.rank }}</span>
        </div>
        <p v-if="selectedEntry">{{ selectedEntry.zh }}<span class="muted small">（词库词条）</span></p>
        <p v-if="selected.word" :class="{ 'muted small': selectedEntry }">{{ selected.word.zh }}</p>
        <p v-if="selected.word?.en" class="muted small">{{ selected.word.en }}</p>
        <p v-if="selectedMorph" class="muted small">构词：{{ selectedMorph }}</p>
        <template v-if="selectedNote">
          <p class="muted small">词源：{{ selectedNote.etymology }}</p>
          <p class="muted small">常用搭配：{{ selectedNote.collocations.join('；') }}</p>
          <p class="small">
            例：{{ selectedNote.example.en }}<br />
            <span class="muted">{{ selectedNote.example.zh }}</span>
          </p>
        </template>
        <p v-else-if="!selectedEntry" class="muted small">
          词典里没有这个词。需要的话可以到<RouterLink to="/library">词库</RouterLink>里手动添加。
        </p>
        <p v-if="selectedEtymUrl" class="muted small">
          <a :href="selectedEtymUrl" target="_blank" rel="noopener">在 Etymonline 查这个词的词源 ↗</a>
        </p>
        <div v-if="selected.word" class="row">
          <button v-if="selectedStatus === 'unknown' || selectedStatus === 'known'" type="button" @click="collectSelected">
            {{ selectedStatus === 'known' ? '其实不认识，收进生词本' : '收进生词本' }}
          </button>
          <button v-if="selectedStatus === 'unknown'" type="button" @click="vocab.setMark(selected.key!, 'known')">
            我认识
          </button>
          <span v-if="selectedStatus === 'learning'" class="muted small">已经在生词本或复习里了。</span>
        </div>
      </section>

      <section class="panel">
        <p class="legend muted small">
          <span class="w unknown">生词</span> <span class="w learning">学习中</span>
          <span class="w offlist">词典里没有</span> · 点任意一个词看释义
        </p>
        <!-- prettier-ignore -->
        <p class="text"><template v-for="(s, i) in analysis.segments" :key="i"><span v-if="s.status" class="w" :class="[s.status, { on: selected?.start === s.start }]" @click="selected = s">{{ s.text }}</span><template v-else>{{ s.text }}</template></template></p>
      </section>

      <section v-if="fresh.length > 0" class="panel stack">
        <div class="row between">
          <h2>生词 {{ fresh.length }} 个</h2>
          <button v-if="repeated.length > 0" type="button" class="primary" @click="collect(repeated)">
            把出现 2 次以上的 {{ repeated.length }} 个收进生词本
          </button>
        </div>
        <p class="muted small">一篇里收 15–20 个就够了，优先收反复出现的。只出现一次的偏僻词可以放过。</p>
        <table>
          <tbody>
            <tr v-for="u in listed" :key="u.key">
              <td>
                <span class="term">{{ u.word.word }}</span>
                <span v-if="u.count > 1" class="muted small"> ×{{ u.count }}</span>
              </td>
              <td class="muted small">{{ u.word.zh }}</td>
              <td class="n actions">
                <button type="button" class="mini" @click="collect([u])">收</button>
                <button type="button" class="mini" @click="vocab.setMark(u.key, 'known')">认识</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!showAll && fresh.length > LIST_PAGE">
          <button type="button" @click="showAll = true">显示全部 {{ fresh.length }} 个</button>
        </div>
      </section>
    </template>

    <section v-if="history.length > 0" class="panel stack">
      <h2>阅读记录</h2>
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>标题</th>
            <th class="n">词数</th>
            <th class="n">认识占比</th>
            <th class="n">生词</th>
            <th class="n">收词</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in history" :key="r.id">
            <td>{{ fmtDate(r.at) }}</td>
            <td>{{ r.title }}</td>
            <td class="n">{{ r.words }}</td>
            <td class="n">{{ pct(r.coverage) }}</td>
            <td class="n">{{ r.unknown }}</td>
            <td class="n">{{ r.added }}</td>
            <td class="n"><button type="button" class="mini ghost" @click="vocab.deleteReading(r.id)">删除</button></td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
textarea,
input[type='text'] {
  width: 100%;
}

textarea {
  resize: vertical;
}

.stats {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
}

.picked {
  position: sticky;
  top: 52px;
  z-index: 4;
  border-color: var(--accent);
}

.term {
  font-weight: 600;
  font-size: 1.1rem;
}

.text {
  white-space: pre-wrap;
  line-height: 1.9;
  font-size: 1.05rem;
  overflow-wrap: anywhere;
}

.w {
  cursor: pointer;
  border-radius: 3px;
}

.w:hover,
.w.on {
  outline: 2px solid var(--accent);
}

.w.unknown {
  background: var(--mark);
}

.w.learning {
  border-bottom: 2px solid var(--accent);
}

.w.offlist {
  border-bottom: 1px dotted var(--muted);
}

.legend .w {
  cursor: default;
  padding: 0 4px;
}

.legend .w:hover {
  outline: none;
}

.actions {
  white-space: nowrap;
}

.mini {
  padding: 2px 10px;
  font-size: 0.8rem;
  margin-left: 4px;
}
</style>
