import { describe, expect, it } from 'vitest';
import { resolveCommentReaction } from './commentReactions';

describe('resolveCommentReaction', () => {
  it.each([
    ['かわいい', { particles: 'heart', preset: 'shy' }],
    ['CUTE', { particles: 'heart', preset: 'shy' }],
    ['８８８', { particles: 'clap', gesture: 'nod', preset: 'celebrate' }],
    ['ぱちぱち', { particles: 'clap', gesture: 'nod', preset: 'celebrate' }],
    ['ｗｗｗ', { gesture: 'laugh', preset: 'laugh' }],
    ['えっ！？', { particles: 'star', preset: 'surprise' }],
    ['おめでとう🎉', { particles: 'petal', preset: 'celebrate' }],
    ['初見です', { preset: 'welcome' }],
    ['悲しい', { preset: 'gloomy' }],
  ])('resolves %s', (text, expected) => {
    expect(resolveCommentReaction(text)).toEqual(expected);
  });

  it('uses the first matching rule and returns null for no match', () => {
    expect(resolveCommentReaction('かわいい wwww')).toEqual({ particles: 'heart', preset: 'shy' });
    expect(resolveCommentReaction('')).toBeNull();
    expect(resolveCommentReaction('hello')).toBeNull();
  });
});
