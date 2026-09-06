import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeStoredSettings } from './defaultSettings';
import { buildVoiceOptions, resolveTtsApiKey } from './coreOptions';

describe('Core settings', () => {
  it('uses the matching LLM key for OpenAI TTS when its own key is empty', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.llm.apiKeys.openai = 'shared-key';
    expect(resolveTtsApiKey(settings)).toBe('shared-key');
  });

  it('maps VOICEVOX settings to Core voice options', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.tts.engine = 'voicevox';
    const result = buildVoiceOptions(settings, async () => undefined);
    expect(result.engineType).toBe('voicevox');
    expect(result.speaker).toBe('1');
    expect((result as { voicevoxApiUrl?: string }).voicevoxApiUrl).toBe('http://localhost:50021');
  });

  it('deep-merges stored settings with newly added TTS profiles', () => {
    const result = mergeStoredSettings({ llm: { provider: 'gemini' } });
    expect(result.llm.provider).toBe('gemini');
    expect(result.tts.profiles.piperPlus.modelFile).toContain('.onnx');
  });
});
