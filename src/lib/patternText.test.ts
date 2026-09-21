import { describe, expect, it } from 'vitest';
import { DEFAULT_PATTERN_TEXT, formatPatternText } from './patternText';

describe('formatPatternText', () => {
  it('uses the default for empty or control-only text', () => {
    expect(formatPatternText('')).toBe(DEFAULT_PATTERN_TEXT);
    expect(formatPatternText('\n\t\u0000')).toBe(DEFAULT_PATTERN_TEXT);
  });

  it('turns controls and newlines into spaces', () => {
    expect(formatPatternText('hello\nworld\t!')).toBe('hello world !');
  });

  it('counts emoji as one code point and truncates to 24 code points', () => {
    const text = '😀'.repeat(30);
    expect(Array.from(formatPatternText(text))).toHaveLength(24);
    expect(formatPatternText(text)).toBe('😀'.repeat(24));
  });
});
