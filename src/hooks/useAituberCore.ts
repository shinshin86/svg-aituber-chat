import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AITuberOnAirCore,
  AITuberOnAirCoreEvent,
  isGPT5Model,
} from '@aituber-onair/core';
import { buildVoiceOptions } from '../lib/coreOptions';
import { isApiKeyOptional } from '../lib/providerCatalog';
import type { ChatMessage } from '../types/chat';
import type { AppSettings } from '../types/settings';

interface UseAituberCoreOptions {
  settings: AppSettings;
  onAudioPlay: (arrayBuffer: ArrayBuffer) => Promise<void>;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
}

export interface ProcessChatOptions {
  displayText?: string;
  author?: string;
  source?: 'local' | 'youtube';
}

function eventText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return String(data ?? '');
  const value = data as {
    message?: string | { content?: string };
    rawText?: string;
    screenplay?: { text?: string };
  };
  return (
    value.screenplay?.text?.trim() ||
    (typeof value.message === 'string' ? value.message : value.message?.content) ||
    value.rawText ||
    ''
  );
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'AITuber OnAir Coreでエラーが発生しました。';
}

export function useAituberCore({
  settings,
  onAudioPlay,
  onSpeechStart,
  onSpeechEnd,
}: UseAituberCoreOptions) {
  const coreRef = useRef<AITuberOnAirCore | null>(null);
  const historyRef = useRef<ReturnType<AITuberOnAirCore['getChatHistory']>>([]);
  const callbackRef = useRef({ onAudioPlay, onSpeechStart, onSpeechEnd });
  const processingRef = useRef(false);
  const idRef = useRef(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [partialResponse, setPartialResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [speechActive, setSpeechActive] = useState(false);
  const [error, setError] = useState('');
  const [configurationMessage, setConfigurationMessage] = useState('');

  callbackRef.current = { onAudioPlay, onSpeechStart, onSpeechEnd };

  const createId = useCallback(() => {
    idRef.current += 1;
    return `${Date.now()}-${idRef.current}`;
  }, []);

  useEffect(() => {
    const apiKey = settings.llm.apiKeys[settings.llm.provider]?.trim() ?? '';
    if (!isApiKeyOptional(settings.llm.provider) && !apiKey) {
      coreRef.current?.offAll();
      coreRef.current = null;
      setConfigurationMessage(`${settings.llm.provider} のAPIキーを設定してください。`);
      return;
    }
    if (settings.llm.provider === 'openai-compatible' && !settings.llm.endpoint.trim()) {
      coreRef.current?.offAll();
      coreRef.current = null;
      setConfigurationMessage('OpenAI互換エンドポイントを設定してください。');
      return;
    }
    if (!settings.llm.model.trim()) {
      coreRef.current?.offAll();
      coreRef.current = null;
      setConfigurationMessage('LLMモデルを選択してください。');
      return;
    }

    let core: AITuberOnAirCore;
    try {
      const isOpenAiGpt5 =
        settings.llm.provider === 'openai' && isGPT5Model(settings.llm.model);
      core = new AITuberOnAirCore({
        apiKey,
        chatProvider: settings.llm.provider,
        model: settings.llm.model,
        providerOptions:
          settings.llm.provider === 'openai-compatible'
            ? { endpoint: settings.llm.endpoint.trim() }
            : isOpenAiGpt5
              ? { gpt5Preset: 'casual' }
              : undefined,
        chatOptions: {
          systemPrompt: settings.llm.systemPrompt.trim(),
          ...(isOpenAiGpt5 ? { responseLength: 'veryShort' as const } : {}),
        },
        voiceOptions: buildVoiceOptions(settings, (audioBuffer) =>
          callbackRef.current.onAudioPlay(audioBuffer),
        ),
        debug: false,
      } as ConstructorParameters<typeof AITuberOnAirCore>[0]);
    } catch (caught) {
      coreRef.current = null;
      setConfigurationMessage(errorText(caught));
      return;
    }

    if (historyRef.current.length) core.setChatHistory(historyRef.current);
    setConfigurationMessage('');

    core.on(AITuberOnAirCoreEvent.PROCESSING_START, () => {
      setError('');
      setIsProcessing(true);
      setPartialResponse('');
    });
    core.on(AITuberOnAirCoreEvent.ASSISTANT_PARTIAL, (data: unknown) => {
      setPartialResponse(eventText(data));
    });
    core.on(AITuberOnAirCoreEvent.ASSISTANT_RESPONSE, (data: unknown) => {
      const content = eventText(data);
      if (content) {
        setMessages((current) => [
          ...current,
          { id: createId(), role: 'assistant', content },
        ]);
      }
      setPartialResponse('');
    });
    core.on(AITuberOnAirCoreEvent.PROCESSING_END, () => {
      setIsProcessing(false);
      setPartialResponse('');
    });
    core.on(AITuberOnAirCoreEvent.SPEECH_START, () => {
      setSpeechActive(true);
      callbackRef.current.onSpeechStart?.();
    });
    core.on(AITuberOnAirCoreEvent.SPEECH_END, () => {
      setSpeechActive(false);
      callbackRef.current.onSpeechEnd?.();
    });
    core.on(AITuberOnAirCoreEvent.ERROR, (caught: unknown) => {
      setError(errorText(caught));
      setIsProcessing(false);
      setSpeechActive(false);
      callbackRef.current.onSpeechEnd?.();
    });

    coreRef.current = core;
    return () => {
      historyRef.current = core.getChatHistory();
      core.offAll();
      if (coreRef.current === core) coreRef.current = null;
    };
  }, [createId, settings.llm, settings.tts]);

  const processChat = useCallback(
    async (text: string, options: ProcessChatOptions = {}): Promise<boolean> => {
      const core = coreRef.current;
      const content = text.trim();
      if (!core || !content || processingRef.current) return false;
      processingRef.current = true;
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'user',
          content: options.displayText?.trim() || content,
          author: options.author,
          source: options.source ?? 'local',
        },
      ]);
      setError('');
      try {
        await core.processChat(content);
        return true;
      } catch (caught) {
        setError(errorText(caught));
        setIsProcessing(false);
        return true;
      } finally {
        processingRef.current = false;
      }
    },
    [createId],
  );

  const clearConversation = useCallback(() => {
    historyRef.current = [];
    coreRef.current?.setChatHistory([]);
    setMessages([]);
    setPartialResponse('');
    setError('');
  }, []);

  return {
    messages,
    partialResponse,
    isProcessing,
    speechActive,
    error,
    configurationMessage,
    processChat,
    clearConversation,
  };
}
