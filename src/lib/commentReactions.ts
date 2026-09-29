import type { AvatarReactionPreset } from '../types/settings';

export interface CommentReaction {
  emotion?: 'happy' | 'surprised';
  gesture?: 'nod' | 'laugh';
  particles?: 'heart' | 'clap' | 'star' | 'petal';
  preset?: AvatarReactionPreset;
}

const REACTION_RULES: Array<[RegExp, CommentReaction]> = [
  [/かわいい|可愛い|kawaii|cute/i, { particles: 'heart', preset: 'shy' }],
  [/8{3,}|ぱちぱち|拍手/i, { particles: 'clap', gesture: 'nod', preset: 'celebrate' }],
  [/草|w{3,}|ｗ{3,}|笑|lol/i, { gesture: 'laugh', preset: 'laugh' }],
  [/！？|!\?|えっ|まじ|マジ/i, { particles: 'star', preset: 'surprise' }],
  [/おめでとう|おめ|🎉/i, { particles: 'petal', preset: 'celebrate' }],
  [/初見|はじめまして|こんにちは|こんばんは/i, { preset: 'welcome' }],
  [/つらい|悲しい|かなしい|しょんぼり/i, { preset: 'gloomy' }],
];

export function resolveCommentReaction(text: string): CommentReaction | null {
  const normalized = text.normalize('NFKC').toLowerCase();
  if (!normalized.trim()) return null;
  return REACTION_RULES.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
}
