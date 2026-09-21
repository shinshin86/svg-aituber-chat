import { describe, expect, it } from 'vitest';
import { extractEmotion, normalizeEmotion } from './emotion';

describe('emotion helpers', () => {
  it('extracts an emotion from a screenplay payload', () => {
    expect(extractEmotion({ screenplay: { emotion: 'HAPPY' } })).toBe('happy');
  });

  it('extracts bracket tags from partial response text', () => {
    expect(extractEmotion('[sad] 今日は静かに話します')).toBe('sad');
  });

  it('normalizes unknown values to neutral', () => {
    expect(normalizeEmotion('confused')).toBe('neutral');
    expect(extractEmotion({ screenplay: { emotion: 42 } })).toBe('neutral');
  });
});
