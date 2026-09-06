import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceEngineAdapter } from '@aituber-onair/core';
import { buildVoiceOptions } from '../lib/coreOptions';
import type { AppSettings } from '../types/settings';

const TEST_MESSAGE = 'こんにちは。選択した音声と口パクのテストです。';

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || '音声テストに失敗しました。');
}

export function useVoiceTest(
  settings: AppSettings,
  unlockAudio: () => Promise<void>,
  playAudio: (arrayBuffer: ArrayBuffer) => Promise<void>,
) {
  const adapterRef = useRef<VoiceEngineAdapter | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState('');

  const stop = useCallback(() => {
    adapterRef.current?.stop();
    adapterRef.current = null;
    setIsTesting(false);
  }, []);

  const testVoice = useCallback(async () => {
    if (isTesting || settings.tts.engine === 'none') return;
    stop();
    setError('');
    setIsTesting(true);
    try {
      await unlockAudio();
      const adapter = new VoiceEngineAdapter(buildVoiceOptions(settings, playAudio));
      adapterRef.current = adapter;
      await adapter.speakText(TEST_MESSAGE);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      adapterRef.current = null;
      setIsTesting(false);
    }
  }, [isTesting, playAudio, settings, stop, unlockAudio]);

  useEffect(() => stop, [stop]);

  return { testVoice, stop, isTesting, error };
}
