export type LlmProvider =
  | 'openai'
  | 'openai-compatible'
  | 'openrouter'
  | 'gemini'
  | 'gemini-nano'
  | 'claude'
  | 'zai'
  | 'kimi'
  | 'xai'
  | 'deepseek'
  | 'mistral'
  | 'sakana'
  | 'plamo';

export type TtsEngine =
  | 'openai'
  | 'geminiTts'
  | 'openaiCompatible'
  | 'voicevox'
  | 'voicepeak'
  | 'aivisSpeech'
  | 'aivisCloud'
  | 'minimax'
  | 'xai'
  | 'unrealSpeech'
  | 'elevenLabs'
  | 'fishAudio'
  | 'cartesia'
  | 'inworld'
  | 'gradium'
  | 'piperPlus'
  | 'webSpeech'
  | 'none';

export interface LlmSettings {
  provider: LlmProvider;
  model: string;
  endpoint: string;
  systemPrompt: string;
  apiKeys: Partial<Record<LlmProvider, string>>;
}

export interface TtsProfile {
  apiKey: string;
  endpoint: string;
  speaker: string;
  model: string;
  language: string;
  groupId: string;
  outputFormat: string;
  rate: string;
  pitch: string;
  volume: string;
  styleId: string;
  voiceFile: string;
  modelFile: string;
  modelConfigFile: string;
  noiseScale: string;
}

export interface TtsSettings {
  engine: TtsEngine;
  profiles: Record<TtsEngine, TtsProfile>;
}

export interface StreamSettings {
  youtubeApiKey: string;
  youtubeLiveId: string;
  youtubeEnabled: boolean;
  youtubeCommentIntervalMs: number;
  playAvatarEffectOnComment: boolean;
  commentReactions: boolean;
}

export type AvatarVisualMode = 'normal' | 'monochrome' | 'lineArt' | 'neon' | 'poster';
export type AvatarColorMood = 'neutral' | 'happy' | 'calm' | 'dramatic' | 'dreamy';
export type AvatarDistortion = 'none' | 'cyber' | 'water';
export type AvatarPattern = 'none' | 'aurora' | 'scanlines' | 'dots';
export type AvatarReveal = 'none' | 'wipe' | 'iris' | 'draw' | 'dissolve';
export type AvatarBackdrop = 'none' | 'focusLines' | 'halftone';

export interface AvatarSettings {
  background: 'white' | 'dark' | 'green';
  breath: boolean;
  headSway: boolean;
  hairSway: boolean;
  blink: boolean;
  mouseFollow: boolean;
  debug: boolean;
  emotionSync: boolean;
  autoGesture: boolean;
  amplitude: number;
  speed: number;
  visualMode: AvatarVisualMode;
  colorMood: AvatarColorMood;
  audioGlow: boolean;
  outline: 'none' | 'sticker';
  rimLight: boolean;
  aura: boolean;
  dropShadow: boolean;
  glitch: boolean;
  distortion: AvatarDistortion;
  pattern: AvatarPattern;
  reveal: AvatarReveal;
  effectIntensity: number;
  hairHueShift: number;
  emotionParticles: boolean;
  backdrop: AvatarBackdrop;
}

export interface AppSettings {
  llm: LlmSettings;
  tts: TtsSettings;
  avatar: AvatarSettings;
  stream: StreamSettings;
}
