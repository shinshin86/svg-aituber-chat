export const AVATAR_EMOTIONS = ['happy', 'sad', 'angry', 'surprised', 'relaxed', 'neutral'] as const;

export type AvatarEmotion = (typeof AVATAR_EMOTIONS)[number];

const EMOTION_SET = new Set<string>(AVATAR_EMOTIONS);

export function normalizeEmotion(value: unknown): AvatarEmotion {
  if (typeof value !== 'string') return 'neutral';
  const normalized = value.trim().toLowerCase();
  return EMOTION_SET.has(normalized) ? (normalized as AvatarEmotion) : 'neutral';
}

interface EmotionPayload {
  emotion?: unknown;
  screenplay?: { emotion?: unknown };
}

export function extractEmotion(value: unknown): AvatarEmotion {
  if (typeof value === 'string') {
    const tag = value.match(/\[([a-z]+)\]/i)?.[1];
    return normalizeEmotion(tag);
  }
  if (!value || typeof value !== 'object') return 'neutral';
  const payload = value as EmotionPayload;
  return normalizeEmotion(payload.screenplay?.emotion ?? payload.emotion);
}
