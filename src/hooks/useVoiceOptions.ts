import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getVoiceEngineCapabilities,
  getVoiceEngineVoiceList,
  type VoiceEngineVoice,
  type VoiceEngineVoiceListOptions,
} from '@aituber-onair/core';
import { resolveTtsApiKey } from '../lib/coreOptions';
import { getStaticVoiceOptions, mergeVoiceOptions } from '../lib/voiceCatalog';
import type { AppSettings, TtsEngine } from '../types/settings';

const KEY_REQUIRED_FOR_LIST = new Set<TtsEngine>([
  'xai', 'elevenLabs', 'fishAudio', 'cartesia', 'inworld', 'gradium',
]);

function fishAudioVoiceListUrl(endpoint: string): string | undefined {
  const value = endpoint.trim();
  if (!value) return undefined;
  return value.replace(/\/v1\/tts\/?$/, '/model');
}

export function buildVoiceListOptions(settings: AppSettings): VoiceEngineVoiceListOptions {
  const { engine, profiles } = settings.tts;
  const profile = profiles[engine];
  return {
    apiKey: resolveTtsApiKey(settings) || undefined,
    apiUrl: profile.endpoint.trim() || undefined,
    voiceListApiUrl:
      engine === 'fishAudio' ? fishAudioVoiceListUrl(profile.endpoint) : undefined,
    language: profile.language.trim() || undefined,
    timeoutMs: 8_000,
  };
}

function formatVoice(engine: TtsEngine, voice: VoiceEngineVoice): VoiceEngineVoice {
  if (engine !== 'aivisCloud' || !voice.metadata?.speakers) return voice;
  return { ...voice, label: `${voice.label} — ${voice.metadata.speakers}` };
}

function friendlyVoiceListError(engine: TtsEngine, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (engine === 'aivisSpeech') {
    return `話者一覧を取得できません。AivisSpeechの起動とAPI URLを確認してください。（${detail}）`;
  }
  if (engine === 'voicevox') {
    return `話者一覧を取得できません。VOICEVOXの起動とAPI URLを確認してください。（${detail}）`;
  }
  return `話者一覧を取得できませんでした。（${detail}）`;
}

export interface VoiceOptionsState {
  voices: VoiceEngineVoice[];
  supportsDynamicList: boolean;
  needsApiKey: boolean;
  isLoading: boolean;
  error: string;
  reload: () => Promise<void>;
}

export function useVoiceOptions(settings: AppSettings): VoiceOptionsState {
  const engine = settings.tts.engine;
  const profile = settings.tts.profiles[engine];
  const apiKey = resolveTtsApiKey(settings);
  const fallback = useMemo(() => getStaticVoiceOptions(engine), [engine]);
  const listOptions = useMemo(
    () => buildVoiceListOptions(settings),
    [apiKey, engine, profile.endpoint, profile.language],
  );
  const supportsDynamicList = getVoiceEngineCapabilities(engine).supportsVoiceList;
  const needsApiKey = KEY_REQUIRED_FOR_LIST.has(engine) && !apiKey.trim();
  const [voices, setVoices] = useState<VoiceEngineVoice[]>(fallback);
  const [voicesEngine, setVoicesEngine] = useState<TtsEngine>(engine);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    if (!supportsDynamicList || needsApiKey) return;
    const requestId = ++requestRef.current;
    setIsLoading(true);
    setError('');
    try {
      const fetched = await getVoiceEngineVoiceList(
        engine,
        listOptions,
      );
      if (requestRef.current !== requestId) return;
      const normalized = fetched.map((voice) => formatVoice(engine, voice));
      setVoicesEngine(engine);
      setVoices(mergeVoiceOptions(normalized, fallback));
      if (normalized.length === 0 && fallback.length === 0) {
        setError('利用できる話者が見つかりませんでした。');
      }
    } catch (caught) {
      if (requestRef.current !== requestId) return;
      setVoices(fallback);
      setError(friendlyVoiceListError(engine, caught));
    } finally {
      if (requestRef.current === requestId) setIsLoading(false);
    }
  }, [engine, fallback, listOptions, needsApiKey, supportsDynamicList]);

  useEffect(() => {
    requestRef.current += 1;
    setVoicesEngine(engine);
    setVoices(fallback);
    setError('');
    setIsLoading(false);
    if (!supportsDynamicList || needsApiKey) return;

    const timer = window.setTimeout(() => void reload(), 250);
    return () => {
      window.clearTimeout(timer);
      requestRef.current += 1;
    };
  }, [
    apiKey,
    engine,
    fallback,
    needsApiKey,
    profile.endpoint,
    profile.language,
    reload,
    supportsDynamicList,
  ]);

  return {
    voices: voicesEngine === engine ? voices : fallback,
    supportsDynamicList,
    needsApiKey,
    isLoading,
    error,
    reload,
  };
}
