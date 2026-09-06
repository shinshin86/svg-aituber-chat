import type { LlmProvider, TtsEngine } from '../types/settings';

export const LLM_PROVIDERS: ReadonlyArray<{
  value: LlmProvider;
  label: string;
  keyOptional?: boolean;
  browserNote?: string;
}> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai-compatible', label: 'OpenAI互換' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'gemini-nano', label: 'Gemini Nano', keyOptional: true, browserNote: 'Chrome Built-in AIが必要です' },
  { value: 'claude', label: 'Claude' },
  { value: 'zai', label: 'Z.ai' },
  { value: 'kimi', label: 'Kimi' },
  { value: 'xai', label: 'xAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'sakana', label: 'Sakana AI', browserNote: 'ブラウザのCORS制限によりプロキシが必要な場合があります' },
  { value: 'plamo', label: 'PLaMo' },
];

export const TTS_ENGINES: ReadonlyArray<{
  value: TtsEngine;
  label: string;
  lipSync: boolean;
  note?: string;
}> = [
  { value: 'openai', label: 'OpenAI TTS', lipSync: true },
  { value: 'geminiTts', label: 'Gemini TTS', lipSync: true },
  { value: 'openaiCompatible', label: 'OpenAI互換TTS', lipSync: true },
  { value: 'voicevox', label: 'VOICEVOX', lipSync: true },
  { value: 'voicepeak', label: 'VoicePeak', lipSync: true },
  { value: 'aivisSpeech', label: 'AivisSpeech', lipSync: true },
  { value: 'aivisCloud', label: 'Aivis Cloud', lipSync: true },
  { value: 'minimax', label: 'MiniMax', lipSync: true },
  { value: 'xai', label: 'xAI TTS', lipSync: true },
  { value: 'unrealSpeech', label: 'Unreal Speech', lipSync: true },
  { value: 'elevenLabs', label: 'ElevenLabs', lipSync: true },
  { value: 'fishAudio', label: 'Fish Audio', lipSync: true, note: '通常はCORSプロキシが必要です' },
  { value: 'cartesia', label: 'Cartesia', lipSync: true },
  { value: 'inworld', label: 'Inworld', lipSync: true },
  { value: 'gradium', label: 'Gradium', lipSync: true },
  { value: 'piperPlus', label: 'Piper Plus', lipSync: true, note: 'ローカルのモデルファイルが必要です' },
  { value: 'webSpeech', label: 'Web Speech API', lipSync: false, note: '音声バッファを取得できないためリップシンク非対応です' },
  { value: 'none', label: '音声なし', lipSync: false },
];

export function isApiKeyOptional(provider: LlmProvider): boolean {
  return provider === 'openai-compatible' || Boolean(LLM_PROVIDERS.find((item) => item.value === provider)?.keyOptional);
}

export function supportsAudioLipSync(engine: TtsEngine): boolean {
  return Boolean(TTS_ENGINES.find((item) => item.value === engine)?.lipSync);
}
