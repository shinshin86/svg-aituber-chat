import type { AppSettings, TtsEngine, TtsProfile } from '../types/settings';

const emptyProfile = (): TtsProfile => ({
  apiKey: '',
  endpoint: '',
  speaker: '',
  model: '',
  language: '',
  groupId: '',
  outputFormat: '',
  rate: '',
  pitch: '',
  volume: '',
  styleId: '',
  voiceFile: '',
  modelFile: '',
  modelConfigFile: '',
  noiseScale: '',
});

export const DEFAULT_TTS_PROFILES: Record<TtsEngine, TtsProfile> = {
  openai: { ...emptyProfile(), speaker: 'alloy' },
  geminiTts: { ...emptyProfile(), speaker: 'Zephyr', model: 'gemini-3.1-flash-tts-preview', language: 'ja-JP' },
  openaiCompatible: { ...emptyProfile(), endpoint: 'http://localhost:8880/v1/audio/speech', model: 'local-model' },
  voicevox: { ...emptyProfile(), endpoint: 'http://localhost:50021', speaker: '1' },
  voicepeak: { ...emptyProfile(), endpoint: 'http://localhost:20202', speaker: 'f1' },
  aivisSpeech: { ...emptyProfile(), endpoint: 'http://localhost:10101', speaker: '888753760' },
  aivisCloud: { ...emptyProfile(), speaker: '22e8ed77-94fe-4ef2-871f-a86f94e9a579' },
  minimax: { ...emptyProfile(), speaker: 'Japanese_IntellectualSenior' },
  xai: { ...emptyProfile(), speaker: 'eve', language: 'auto', outputFormat: 'mp3' },
  unrealSpeech: { ...emptyProfile(), endpoint: 'https://api.v8.unrealspeech.com/stream', speaker: 'af_bella' },
  elevenLabs: { ...emptyProfile(), endpoint: 'https://api.elevenlabs.io/v1/text-to-speech', model: 'eleven_flash_v2_5', outputFormat: 'mp3_44100_128' },
  fishAudio: { ...emptyProfile(), endpoint: '/api/fish-audio/v1/tts', model: 's2-pro', outputFormat: 'mp3' },
  cartesia: { ...emptyProfile(), endpoint: 'https://api.cartesia.ai/tts/bytes', model: 'sonic-3.5', language: 'ja', outputFormat: 'wav' },
  inworld: { ...emptyProfile(), endpoint: 'https://api.inworld.ai/tts/v1/voice', model: 'inworld-tts-2', language: 'ja-JP', outputFormat: 'MP3' },
  gradium: { ...emptyProfile(), endpoint: 'https://api.gradium.ai/api/post/speech/tts', speaker: 'YTpq7expH9539ERJ', outputFormat: 'wav' },
  piperPlus: {
    ...emptyProfile(),
    endpoint: '/piper/',
    speaker: 'default',
    modelConfigFile: 'tsukuyomi-config.json',
    modelFile: 'tsukuyomi-wavlm-300epoch.onnx',
    voiceFile: 'mei_normal.htsvoice',
  },
  webSpeech: { ...emptyProfile(), language: 'ja-JP', rate: '1', pitch: '1', volume: '1' },
  none: emptyProfile(),
};

export const DEFAULT_SETTINGS: AppSettings = {
  llm: {
    provider: 'openai',
    model: 'gpt-4.1-nano',
    endpoint: 'http://localhost:11434/v1/chat/completions',
    systemPrompt: 'あなたは明るく親しみやすいAIキャラクターです。返答は日本語で短く自然に話してください。返答の先頭に [happy] [sad] [angry] [surprised] [neutral] のいずれか1つを付けてください。',
    apiKeys: {},
  },
  tts: {
    engine: 'openai',
    profiles: DEFAULT_TTS_PROFILES,
  },
  avatar: {
    background: 'white',
    breath: true,
    headSway: true,
    hairSway: true,
    blink: true,
    mouseFollow: true,
    debug: false,
    emotionSync: true,
    autoGesture: true,
    amplitude: 1,
    speed: 1,
    visualMode: 'normal',
    colorMood: 'neutral',
    audioGlow: false,
    glitch: false,
    distortion: 'none',
    pattern: 'none',
    reveal: 'none',
    effectIntensity: 1,
  },
  stream: {
    youtubeApiKey: '',
    youtubeLiveId: '',
    youtubeEnabled: false,
    youtubeCommentIntervalMs: 20_000,
    playAvatarEffectOnComment: true,
  },
};

export function mergeStoredSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_SETTINGS);
  const stored = value as Partial<AppSettings>;
  const storedProfiles = stored.tts?.profiles ?? {};
  const profiles = Object.fromEntries(
    Object.entries(DEFAULT_TTS_PROFILES).map(([engine, defaults]) => [
      engine,
      { ...defaults, ...(storedProfiles as Partial<Record<TtsEngine, Partial<TtsProfile>>>)[engine as TtsEngine] },
    ]),
  ) as Record<TtsEngine, TtsProfile>;

  return {
    llm: {
      ...DEFAULT_SETTINGS.llm,
      ...stored.llm,
      apiKeys: { ...DEFAULT_SETTINGS.llm.apiKeys, ...stored.llm?.apiKeys },
    },
    tts: { ...DEFAULT_SETTINGS.tts, ...stored.tts, profiles },
    avatar: { ...DEFAULT_SETTINGS.avatar, ...stored.avatar },
    // Streaming must always be started by a user gesture so browser audio can
    // be unlocked before an automatic TTS response is played.
    stream: { ...DEFAULT_SETTINGS.stream, ...stored.stream, youtubeEnabled: false },
  };
}
