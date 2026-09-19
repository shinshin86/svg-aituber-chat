import { describe, expect, it } from 'vitest';
import { resolveCommentReaction } from './commentReactions';

describe('resolveCommentReaction', () => {
  it.each([
    ['かわいい', { emotion: 'happy', particles: 'heart' }],
    ['CUTE', { emotion: 'happy', particles: 'heart' }],
    ['８８８', { particles: 'clap', gesture: 'nod' }],
    ['ぱちぱち', { particles: 'clap', gesture: 'nod' }],
    ['ｗｗｗ', { gesture: 'laugh', emotion: 'happy' }],
    ['えっ！？', { emotion: 'surprised', particles: 'star' }],
    ['おめでとう🎉', { particles: 'petal', emotion: 'happy' }],
  ])('resolves %s', (text, expected) => {
    expect(resolveCommentReaction(text)).toEqual(expected);
  });

  it('uses the first matching rule and returns null for no match', () => {
    expect(resolveCommentReaction('かわいい wwww')).toEqual({ emotion: 'happy', particles: 'heart' });
    expect(resolveCommentReaction('')).toBeNull();
    expect(resolveCommentReaction('hello')).toBeNull();
  });
});
