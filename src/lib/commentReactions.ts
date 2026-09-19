export interface CommentReaction {
  emotion?: 'happy' | 'surprised';
  gesture?: 'nod' | 'laugh';
  particles?: 'heart' | 'clap' | 'star' | 'petal';
}

const REACTION_RULES: Array<[RegExp, CommentReaction]> = [
  [/かわいい|可愛い|kawaii|cute/i, { emotion: 'happy', particles: 'heart' }],
  [/8{3,}|ぱちぱち|拍手/i, { particles: 'clap', gesture: 'nod' }],
  [/草|w{3,}|ｗ{3,}|笑|lol/i, { gesture: 'laugh', emotion: 'happy' }],
  [/！？|!\?|えっ|まじ|マジ/i, { emotion: 'surprised', particles: 'star' }],
  [/おめでとう|おめ|🎉/i, { particles: 'petal', emotion: 'happy' }],
];

export function resolveCommentReaction(text: string): CommentReaction | null {
  const normalized = text.normalize('NFKC').toLowerCase();
  if (!normalized.trim()) return null;
  return REACTION_RULES.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
}
