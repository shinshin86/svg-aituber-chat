import { describe, expect, it } from 'vitest';
import { rotateHue } from './avatarColor';

describe('rotateHue', () => {
  it('keeps neutral colors byte-identical at zero', () => {
    expect(rotateHue('#8A4B2A', 0)).toBe('#8A4B2A');
  });

  it('rotates hue while keeping saturation and lightness', () => {
    expect(rotateHue('#FF0000', 120)).toBe('#00FF00');
    expect(rotateHue('#00FF00', -120)).toBe('#FF0000');
  });
});
