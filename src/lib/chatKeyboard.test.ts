import { describe, expect, it } from 'vitest';
import { shouldSubmitChat } from './chatKeyboard';

describe('shouldSubmitChat', () => {
  it('submits a normal Enter key', () => {
    expect(shouldSubmitChat({ key: 'Enter', shiftKey: false })).toBe(true);
  });

  it('does not submit Enter while a Japanese IME conversion is active', () => {
    expect(shouldSubmitChat({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false);
    expect(shouldSubmitChat({ key: 'Enter', shiftKey: false, keyCode: 229 })).toBe(false);
  });

  it('keeps Shift+Enter as a line break', () => {
    expect(shouldSubmitChat({ key: 'Enter', shiftKey: true })).toBe(false);
  });
});
