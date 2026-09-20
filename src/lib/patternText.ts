export const DEFAULT_PATTERN_TEXT = 'AITuber OnAir';

export function formatPatternText(text: string): string {
  const normalized = Array.from(String(text ?? ''))
    .map((character) => /[\p{Cc}\p{Cf}]/u.test(character) ? ' ' : character)
    .join('')
    .replace(/\s+/gu, ' ')
    .trim();
  return Array.from(normalized || DEFAULT_PATTERN_TEXT).slice(0, 24).join('');
}
