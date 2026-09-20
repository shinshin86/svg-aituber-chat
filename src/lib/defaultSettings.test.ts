import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeStoredSettings } from './defaultSettings';

describe('avatar advanced effect settings', () => {
  it('fills advanced defaults when loading legacy settings', () => {
    const settings = mergeStoredSettings({ avatar: { breath: false } });

    expect(settings.avatar.breath).toBe(false);
    expect(settings.avatar.visualMode).toBe('normal');
    expect(settings.avatar.colorMood).toBe('neutral');
    expect(settings.avatar.emotionSync).toBe(true);
    expect(settings.avatar.autoGesture).toBe(true);
    expect(settings.avatar.outline).toBe('none');
    expect(settings.avatar.rimLight).toBe(false);
    expect(settings.avatar.aura).toBe('none');
    expect(settings.avatar.voiceEcho).toBe(false);
    expect(settings.avatar.dropShadow).toBe(false);
    expect(settings.avatar.visualMode).toBe('normal');
    expect(settings.avatar.reveal).toBe('none');
    expect(settings.avatar.effectIntensity).toBe(1);
    expect(settings.avatar.hairHueShift).toBe(0);
    expect(settings.avatar.emotionParticles).toBe(false);
    expect(settings.avatar.backdrop).toBe('none');
    expect(settings.avatar.wobble).toBe('none');
    expect(settings.avatar.hairPattern).toBe('none');
    expect(settings.avatar.textPattern).toBe(false);
    expect(settings.stream.youtubeEnabled).toBe(false);
    expect(settings.stream.youtubeCommentIntervalMs).toBe(20_000);
    expect(settings.stream.commentReactions).toBe(true);
  });

  it('keeps saved advanced effect choices', () => {
    const settings = mergeStoredSettings({
      avatar: {
        ...DEFAULT_SETTINGS.avatar,
        visualMode: 'lineArt',
        glitch: true,
        pattern: 'aurora',
      },
    });

    expect(settings.avatar.visualMode).toBe('lineArt');
    expect(settings.avatar.glitch).toBe(true);
    expect(settings.avatar.pattern).toBe('aurora');
  });

  it('migrates legacy boolean aura settings', () => {
    expect(mergeStoredSettings({ avatar: { aura: true } }).avatar.aura).toBe('glow');
    expect(mergeStoredSettings({ avatar: { aura: false } }).avatar.aura).toBe('none');
    expect(mergeStoredSettings({ avatar: { aura: 'flame' } }).avatar.aura).toBe('flame');
  });

  it('keeps saved YouTube stream settings while filling new defaults', () => {
    const settings = mergeStoredSettings({
      stream: {
        youtubeLiveId: 'example-live-id',
        youtubeCommentIntervalMs: 30_000,
        youtubeEnabled: true,
      },
    });

    expect(settings.stream.youtubeLiveId).toBe('example-live-id');
    expect(settings.stream.youtubeCommentIntervalMs).toBe(30_000);
    expect(settings.stream.playAvatarEffectOnComment).toBe(true);
    expect(settings.stream.commentReactions).toBe(true);
    expect(settings.stream.youtubeEnabled).toBe(false);
  });
});
