import { useCallback, useEffect, useMemo, useState } from 'react';
import { AITuberOnAirCore } from '@aituber-onair/core';
import { DEFAULT_SETTINGS, mergeStoredSettings } from '../lib/defaultSettings';
import type { AppSettings, LlmProvider, TtsEngine, TtsProfile } from '../types/settings';

const STORAGE_KEY = 'svg-aituber-chat-settings-v1';

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? mergeStoredSettings(JSON.parse(stored)) : structuredClone(DEFAULT_SETTINGS);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const availableModels = useMemo(() => {
    if (settings.llm.provider === 'openai-compatible') return [];
    try {
      return AITuberOnAirCore.getSupportedModels(settings.llm.provider);
    } catch {
      return [];
    }
  }, [settings.llm.provider]);

  const updateLlm = useCallback((patch: Partial<AppSettings['llm']>) => {
    setSettings((current) => ({ ...current, llm: { ...current.llm, ...patch } }));
  }, []);

  const setProvider = useCallback((provider: LlmProvider) => {
    let model = '';
    try {
      model = AITuberOnAirCore.getSupportedModels(provider)[0] ?? '';
    } catch {
      model = '';
    }
    setSettings((current) => ({
      ...current,
      llm: { ...current.llm, provider, model: provider === 'openai-compatible' ? 'local-model' : model },
    }));
  }, []);

  const setLlmApiKey = useCallback((provider: LlmProvider, apiKey: string) => {
    setSettings((current) => ({
      ...current,
      llm: { ...current.llm, apiKeys: { ...current.llm.apiKeys, [provider]: apiKey } },
    }));
  }, []);

  const setTtsEngine = useCallback((engine: TtsEngine) => {
    setSettings((current) => ({ ...current, tts: { ...current.tts, engine } }));
  }, []);

  const updateTtsProfile = useCallback((engine: TtsEngine, patch: Partial<TtsProfile>) => {
    setSettings((current) => ({
      ...current,
      tts: {
        ...current.tts,
        profiles: {
          ...current.tts.profiles,
          [engine]: { ...current.tts.profiles[engine], ...patch },
        },
      },
    }));
  }, []);

  const updateAvatar = useCallback((patch: Partial<AppSettings['avatar']>) => {
    setSettings((current) => ({ ...current, avatar: { ...current.avatar, ...patch } }));
  }, []);

  const updateStream = useCallback((patch: Partial<AppSettings['stream']>) => {
    setSettings((current) => ({ ...current, stream: { ...current.stream, ...patch } }));
  }, []);

  return {
    settings,
    availableModels,
    updateLlm,
    setProvider,
    setLlmApiKey,
    setTtsEngine,
    updateTtsProfile,
    updateAvatar,
    updateStream,
  };
}
