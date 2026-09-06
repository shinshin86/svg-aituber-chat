import type {
  CartesiaLanguage,
  CartesiaOutputContainer,
  FishAudioFormat,
  FishAudioModel,
  GradiumOutputFormat,
  InworldAudioEncoding,
  VoiceServiceOptions,
} from '@aituber-onair/core';
import type { AppSettings } from '../types/settings';

const optionalNumber = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function resolveTtsApiKey(settings: AppSettings): string {
  const { engine, profiles } = settings.tts;
  const ownKey = profiles[engine].apiKey.trim();
  if (ownKey) return ownKey;
  if (engine === 'openai') return settings.llm.apiKeys.openai?.trim() ?? '';
  if (engine === 'geminiTts') return settings.llm.apiKeys.gemini?.trim() ?? '';
  if (engine === 'xai') return settings.llm.apiKeys.xai?.trim() ?? '';
  return '';
}

export function buildVoiceOptions(
  settings: AppSettings,
  onPlay: (audioBuffer: ArrayBuffer) => Promise<void>,
): VoiceServiceOptions {
  const { engine, profiles } = settings.tts;
  const profile = profiles[engine];

  return {
    engineType: engine,
    apiKey: resolveTtsApiKey(settings),
    speaker: profile.speaker || undefined,
    openAiCompatibleApiUrl: profile.endpoint || undefined,
    openAiCompatibleModel: profile.model || undefined,
    openAiCompatibleSpeed: optionalNumber(profile.rate),
    geminiTtsModel: profile.model || undefined,
    geminiTtsLanguageCode: profile.language || undefined,
    voicevoxApiUrl: profile.endpoint || undefined,
    voicepeakApiUrl: profile.endpoint || undefined,
    aivisSpeechApiUrl: profile.endpoint || undefined,
    aivisCloudModelUuid:
      engine === 'aivisCloud' ? profile.speaker || undefined : undefined,
    aivisCloudSpeakerUuid:
      engine === 'aivisCloud' ? profile.model || undefined : undefined,
    aivisCloudStyleId:
      engine === 'aivisCloud' ? optionalNumber(profile.styleId) : undefined,
    groupId: engine === 'minimax' ? profile.groupId || undefined : undefined,
    xaiLanguage: engine === 'xai' ? profile.language || undefined : undefined,
    xaiCodec: engine === 'xai' ? (profile.outputFormat || 'mp3') as 'mp3' | 'wav' | 'pcm' | 'mulaw' | 'alaw' : undefined,
    unrealSpeechApiUrl:
      engine === 'unrealSpeech' ? profile.endpoint || undefined : undefined,
    elevenLabsApiUrl:
      engine === 'elevenLabs' ? profile.endpoint || undefined : undefined,
    elevenLabsModel:
      engine === 'elevenLabs' ? profile.model || undefined : undefined,
    elevenLabsOutputFormat:
      engine === 'elevenLabs' ? profile.outputFormat || undefined : undefined,
    fishAudioApiUrl:
      engine === 'fishAudio' ? profile.endpoint || undefined : undefined,
    fishAudioModel:
      engine === 'fishAudio' ? (profile.model || undefined) as FishAudioModel | undefined : undefined,
    fishAudioFormat:
      engine === 'fishAudio' ? (profile.outputFormat || undefined) as FishAudioFormat | undefined : undefined,
    fishAudioSpeed:
      engine === 'fishAudio' ? optionalNumber(profile.rate) : undefined,
    cartesiaApiUrl:
      engine === 'cartesia' ? profile.endpoint || undefined : undefined,
    cartesiaModel:
      engine === 'cartesia' ? profile.model || undefined : undefined,
    cartesiaLanguage:
      engine === 'cartesia' ? (profile.language || undefined) as CartesiaLanguage | undefined : undefined,
    cartesiaOutputContainer:
      engine === 'cartesia' ? (profile.outputFormat || undefined) as CartesiaOutputContainer | undefined : undefined,
    inworldApiUrl:
      engine === 'inworld' ? profile.endpoint || undefined : undefined,
    inworldModel:
      engine === 'inworld' ? profile.model || undefined : undefined,
    inworldAudioEncoding:
      engine === 'inworld' ? (profile.outputFormat || undefined) as InworldAudioEncoding | undefined : undefined,
    inworldLanguage:
      engine === 'inworld' ? profile.language || undefined : undefined,
    inworldSpeakingRate:
      engine === 'inworld' ? optionalNumber(profile.rate) : undefined,
    gradiumApiUrl:
      engine === 'gradium' ? profile.endpoint || undefined : undefined,
    gradiumOutputFormat:
      engine === 'gradium' ? (profile.outputFormat || undefined) as GradiumOutputFormat | undefined : undefined,
    piperPlusBasePath:
      engine === 'piperPlus' ? profile.endpoint || undefined : undefined,
    piperPlusModelConfigFile:
      engine === 'piperPlus' ? profile.modelConfigFile || undefined : undefined,
    piperPlusModelFile:
      engine === 'piperPlus' ? profile.modelFile || undefined : undefined,
    piperPlusVoiceFile:
      engine === 'piperPlus' ? profile.voiceFile || undefined : undefined,
    piperPlusSpeed:
      engine === 'piperPlus' ? optionalNumber(profile.rate) : undefined,
    piperPlusNoiseScale:
      engine === 'piperPlus' ? optionalNumber(profile.noiseScale) : undefined,
    webSpeechRate:
      engine === 'webSpeech' ? optionalNumber(profile.rate) : undefined,
    webSpeechPitch:
      engine === 'webSpeech' ? optionalNumber(profile.pitch) : undefined,
    webSpeechVolume:
      engine === 'webSpeech' ? optionalNumber(profile.volume) : undefined,
    webSpeechLanguage:
      engine === 'webSpeech' ? profile.language || undefined : undefined,
    onPlay,
  } as VoiceServiceOptions;
}
