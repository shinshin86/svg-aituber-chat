import { describe, expect, it } from 'vitest';
import { buildVoiceListOptions } from '../hooks/useVoiceOptions';
import { DEFAULT_SETTINGS } from './defaultSettings';
import { getStaticVoiceOptions, mergeVoiceOptions } from './voiceCatalog';

describe('voice options', () => {
  it('provides named selections for engines without a dynamic voice-list API', () => {
    expect(getStaticVoiceOptions('openai')).toContainEqual({ id: 'alloy', label: 'Alloy' });
    expect(getStaticVoiceOptions('voicepeak')).toContainEqual({ id: 'f1', label: '日本人女性 1' });
    expect(getStaticVoiceOptions('geminiTts').length).toBeGreaterThan(20);
  });

  it('passes the selected local AivisSpeech endpoint to Core voice-list lookup', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.tts.engine = 'aivisSpeech';
    settings.tts.profiles.aivisSpeech.endpoint = 'http://127.0.0.1:10101';

    expect(buildVoiceListOptions(settings).apiUrl).toBe('http://127.0.0.1:10101');
  });

  it('derives the Fish Audio list endpoint from its TTS proxy endpoint', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.tts.engine = 'fishAudio';

    expect(buildVoiceListOptions(settings).voiceListApiUrl).toBe('/api/fish-audio/model');
  });

  it('keeps fetched labels ahead of fallback labels without duplicate IDs', () => {
    expect(mergeVoiceOptions(
      [{ id: 'eve', label: 'Eve（取得結果）' }],
      [{ id: 'eve', label: 'Eve' }, { id: 'ara', label: 'Ara' }],
    )).toEqual([
      { id: 'eve', label: 'Eve（取得結果）' },
      { id: 'ara', label: 'Ara' },
    ]);
  });
});
