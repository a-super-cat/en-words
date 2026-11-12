<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue';
import { downloadJson } from '../lib/download';
import { loadVoices, speak, ttsSupported } from '../lib/tts';
import { dayKey } from '../srs/queue';
import { useApp } from '../stores/app';
import { clearAllProgress, exportBackup as buildBackup, importBackup as restoreBackup } from '../stores/backup';
import type { Settings } from '../types';

const app = useApp();
const voices = shallowRef<SpeechSynthesisVoice[]>([]);
const message = ref('');
const failed = ref(false);

onMounted(async () => (voices.value = await loadVoices()));

const say = (text: string, bad = false) => {
  message.value = text;
  failed.value = bad;
};

function setNumber(key: 'newPerDay' | 'reviewMinutes' | 'maxReviews', event: Event, min: number, max: number) {
  const value = Math.round(Number((event.target as HTMLInputElement).value));
  if (Number.isFinite(value)) void app.updateSettings({ [key]: Math.min(max, Math.max(min, value)) } as Partial<Settings>);
}

function toggleCategory(key: string, on: boolean) {
  const off = new Set(app.settings.disabledCategories);
  if (on) off.delete(key);
  else off.add(key);
  void app.updateSettings({ disabledCategories: [...off] });
}

const tryVoice = () => speak('The trade-off here is higher write latency.', app.settings);

async function exportBackup() {
  downloadJson(`en-words-backup-${dayKey(Date.now())}.json`, await buildBackup());
  say('备份文件已下载。');
}

async function readFile(event: Event): Promise<string | null> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  return file ? file.text() : null;
}

async function importBackup(event: Event) {
  const text = await readFile(event);
  if (text === null) return;
  if (!confirm('导入备份会整体替换当前的学习记录、口语练习记录、STAR 故事、自己添加的词条和设置。继续吗？')) return;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return say('这个文件不是合法的 JSON。', true);
  }
  const error = await restoreBackup(data);
  say(error ?? '备份已导入。', error !== null);
}

async function importCsv(event: Event) {
  const text = await readFile(event);
  if (text === null) return;
  const { added, skipped } = await app.importCsv(text);
  say(`导入 ${added} 条${skipped > 0 ? `，跳过 ${skipped} 条（重复或缺少必填项）` : ''}。`, added === 0);
}

async function clearProgress() {
  if (
    !confirm(
      '清空全部学习记录、口语练习记录（含录音）、测评和阅读记录？所有内容会回到未学，这一步不能撤销。生词本里的词和自己添加的词条会保留。建议先导出备份。',
    )
  ) {
    return;
  }
  await clearAllProgress();
  say('学习记录已清空。');
}
</script>

<template>
  <div class="stack">
    <h1>设置</h1>
    <p v-if="message" class="notice" :class="{ bad: failed }" role="status">{{ message }}</p>

    <section class="panel stack">
      <h2>每天的量</h2>
      <div class="grid">
        <label class="field">
          每天新学（条，建议 5 的倍数）
          <input
            type="number"
            min="0"
            max="100"
            step="5"
            :value="app.settings.newPerDay"
            @change="setNumber('newPerDay', $event, 0, 100)"
          />
        </label>
        <label class="field">
          复习时长上限（分钟）
          <input
            type="number"
            min="5"
            max="120"
            step="5"
            :value="app.settings.reviewMinutes"
            @change="setNumber('reviewMinutes', $event, 5, 120)"
          />
        </label>
        <label class="field">
          每天复习上限（张）
          <input
            type="number"
            min="20"
            max="500"
            step="10"
            :value="app.settings.maxReviews"
            @change="setNumber('maxReviews', $event, 20, 500)"
          />
        </label>
      </div>
    </section>

    <section class="panel stack">
      <h2>朗读</h2>
      <p v-if="!ttsSupported" class="notice bad">这个浏览器不支持朗读，听辨题不会出现。</p>
      <template v-else>
        <label class="row">
          <input
            type="checkbox"
            :checked="app.settings.autoSpeak"
            @change="app.updateSettings({ autoSpeak: ($event.target as HTMLInputElement).checked })"
          />
          翻面时自动朗读
        </label>
        <div class="grid">
          <label class="field">
            语音
            <select
              :value="app.settings.voice"
              @change="app.updateSettings({ voice: ($event.target as HTMLSelectElement).value })"
            >
              <option value="">自动选择</option>
              <option v-for="v in voices" :key="v.name" :value="v.name">{{ v.name }}（{{ v.lang }}）</option>
            </select>
          </label>
          <label class="field">
            语速 {{ app.settings.rate.toFixed(1) }}
            <input
              type="range"
              min="0.6"
              max="1.3"
              step="0.1"
              :value="app.settings.rate"
              @change="app.updateSettings({ rate: Number(($event.target as HTMLInputElement).value) })"
            />
          </label>
        </div>
        <div><button type="button" @click="tryVoice">试听</button></div>
      </template>
    </section>

    <section class="panel stack">
      <h2>要学的分类</h2>
      <p class="muted small">关掉的分类不再出新内容，已经学过的照常复习。</p>
      <label v-for="c in app.categories" :key="c.key" class="row">
        <input
          type="checkbox"
          :checked="!app.settings.disabledCategories.includes(c.key)"
          @change="toggleCategory(c.key, ($event.target as HTMLInputElement).checked)"
        />
        <span class="badge">{{ c.layer }}</span>
        {{ c.title }}
        <span class="muted small">{{ app.progress.get(c.key)?.learned ?? 0 }} / {{ app.progress.get(c.key)?.total ?? 0 }}</span>
      </label>
    </section>

    <section class="panel stack">
      <h2>数据</h2>
      <p class="muted small">
        学习记录只存在这个浏览器里。换浏览器、换电脑或清理浏览器数据之前，先导出备份。备份里不含口答录音，录音也只保留最近
        20 次。
      </p>
      <div class="row">
        <button type="button" @click="exportBackup">导出备份</button>
        <label class="btn">导入备份<input type="file" accept=".json,application/json" hidden @change="importBackup" /></label>
        <label class="btn">导入 CSV 词表<input type="file" accept=".csv,text/csv" hidden @change="importCsv" /></label>
      </div>
      <p class="muted small">
        CSV 每行一条，列的顺序是：英文, 中文提示, 例句英文, 例句中文, 层（A/B/C/D）。后三列可以不填，层默认是 C。
      </p>
      <div><button type="button" class="danger" @click="clearProgress">清空学习记录</button></div>
    </section>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
</style>
