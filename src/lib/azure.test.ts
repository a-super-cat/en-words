import { describe, expect, it } from 'vitest';
import { azureEndpoint, buildSsml, escapeXml, ssmlRate, ttsCacheKey } from './azure';

describe('escapeXml', () => {
  it('转义五个 XML 特殊字符', () => {
    expect(escapeXml(`a & b <c> "d" 'e'`)).toBe('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;');
  });
  it('普通文本原样返回', () => {
    expect(escapeXml('The trade-off is clear.')).toBe('The trade-off is clear.');
  });
});

describe('ssmlRate', () => {
  it('语速换成百分比', () => {
    expect(ssmlRate(1)).toBe('100%');
    expect(ssmlRate(0.9)).toBe('90%');
    expect(ssmlRate(1.25)).toBe('125%');
  });
});

describe('buildSsml', () => {
  it('包含语音名、语速和转义后的文本', () => {
    const ssml = buildSsml('Fish & chips', 'en-US-JennyNeural', 0.9);
    expect(ssml).toContain('<voice name="en-US-JennyNeural">');
    expect(ssml).toContain('rate="90%"');
    expect(ssml).toContain('Fish &amp; chips');
    expect(ssml.startsWith('<speak')).toBe(true);
  });
});

describe('azureEndpoint', () => {
  it('区域去空白转小写后拼进域名', () => {
    expect(azureEndpoint(' EastUS ')).toBe('https://eastus.tts.speech.microsoft.com/cognitiveservices/v1');
  });
});

describe('ttsCacheKey', () => {
  it('相同输入得到相同键', () => {
    expect(ttsCacheKey('hello', 'en-US-JennyNeural', 1)).toBe(ttsCacheKey('hello', 'en-US-JennyNeural', 1));
  });
  it('文本、语音、语速任一不同键就不同', () => {
    const base = ttsCacheKey('hello', 'en-US-JennyNeural', 1);
    expect(ttsCacheKey('hello!', 'en-US-JennyNeural', 1)).not.toBe(base);
    expect(ttsCacheKey('hello', 'en-US-GuyNeural', 1)).not.toBe(base);
    expect(ttsCacheKey('hello', 'en-US-JennyNeural', 0.9)).not.toBe(base);
  });
});
