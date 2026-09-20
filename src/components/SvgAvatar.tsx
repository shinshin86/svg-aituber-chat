import { useEffect, useRef, useState } from 'react';
import avatarUrl from '../../miko.svg?url';
import { createSvgAvatar } from '../avatar/createSvgAvatar.js';
import type { AvatarSettings } from '../types/settings';
import type { CommentReaction } from '../lib/commentReactions';

interface AvatarController {
  counts: unknown;
  setVoiceLevel: (value: number, isSpeaking: boolean, mouthWidth?: number) => void;
  setEmotion: (emotion: string) => void;
  playGesture: (name: string) => void;
  playParticles: (kind: 'heart' | 'star' | 'petal' | 'clap') => void;
  setThinking: (value: boolean) => void;
  setOptions: (options: Record<string, number | boolean>) => void;
  setEffects: (settings: AvatarSettings) => void;
  setPatternText: (text: string) => void;
  replayReveal: () => void;
  destroy: () => void;
}

export interface CommentReactionEvent extends CommentReaction {
  token: number;
}

interface SvgAvatarProps {
  settings: AvatarSettings;
  mouthOpen: number;
  mouthWidth: number;
  isSpeaking: boolean;
  thinking: boolean;
  emotion: string;
  effectReplayToken: number;
  commentReaction: CommentReactionEvent | null;
  patternText: { text: string; token: number } | null;
}

export function SvgAvatar({ settings, mouthOpen, mouthWidth, isSpeaking, thinking, emotion, effectReplayToken, commentReaction, patternText }: SvgAvatarProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<AvatarController | null>(null);
  const commentReactionTimerRef = useRef<number | null>(null);
  const patternTextTimerRef = useRef<number | null>(null);
  const [controllerReady, setControllerReady] = useState(0);
  const latestSettingsRef = useRef(settings);
  const [loadError, setLoadError] = useState('');
  latestSettingsRef.current = settings;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let active = true;
    let controller: AvatarController | null = null;
    void createSvgAvatar(host, avatarUrl)
      .then((result: AvatarController) => {
        if (!active) {
          result.destroy();
          return;
        }
        controller = result;
        controllerRef.current = result;
        setControllerReady((current) => current + 1);
        const currentSettings = latestSettingsRef.current;
        result.setOptions({
          amp: currentSettings.amplitude,
          speed: currentSettings.speed,
          breath: currentSettings.breath,
          headSway: currentSettings.headSway,
          hairSway: currentSettings.hairSway,
          blink: currentSettings.blink,
          mouseFollow: currentSettings.mouseFollow,
          debug: currentSettings.debug,
          emotionSync: currentSettings.emotionSync,
          autoGesture: currentSettings.autoGesture,
        });
        result.setEffects(currentSettings);
        setLoadError('');
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : 'SVGを読み込めませんでした。');
        }
      });
    return () => {
      active = false;
      controller?.destroy();
      if (commentReactionTimerRef.current !== null) window.clearTimeout(commentReactionTimerRef.current);
      if (patternTextTimerRef.current !== null) window.clearTimeout(patternTextTimerRef.current);
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setVoiceLevel(mouthOpen, isSpeaking, mouthWidth);
  }, [isSpeaking, mouthOpen, mouthWidth]);

  useEffect(() => {
    controllerRef.current?.setOptions({
      amp: settings.amplitude,
      speed: settings.speed,
      breath: settings.breath,
      headSway: settings.headSway,
      hairSway: settings.hairSway,
      blink: settings.blink,
      mouseFollow: settings.mouseFollow,
      debug: settings.debug,
      emotionSync: settings.emotionSync,
      autoGesture: settings.autoGesture,
    });
    controllerRef.current?.setEffects(settings);
  }, [settings]);

  useEffect(() => {
    if (commentReactionTimerRef.current !== null) window.clearTimeout(commentReactionTimerRef.current);
    controllerRef.current?.setEmotion(emotion);
  }, [emotion]);

  useEffect(() => {
    if (!commentReaction || !controllerReady) return;
    const controller = controllerRef.current;
    if (!controller) return;
    if (commentReactionTimerRef.current !== null) window.clearTimeout(commentReactionTimerRef.current);
    if (commentReaction.emotion) controller.setEmotion(commentReaction.emotion);
    if (commentReaction.gesture) controller.playGesture(commentReaction.gesture);
    if (commentReaction.particles) controller.playParticles(commentReaction.particles);
    if (commentReaction.emotion) {
      commentReactionTimerRef.current = window.setTimeout(() => {
        controllerRef.current?.setEmotion('neutral');
        commentReactionTimerRef.current = null;
      }, 2500);
    }
  }, [commentReaction, controllerReady]);

  useEffect(() => {
    if (!patternText || !controllerReady) return;
    const controller = controllerRef.current;
    if (!controller) return;
    if (patternTextTimerRef.current !== null) window.clearTimeout(patternTextTimerRef.current);
    controller.setPatternText(patternText.text);
    patternTextTimerRef.current = window.setTimeout(() => {
      controllerRef.current?.setPatternText('');
      patternTextTimerRef.current = null;
    }, 6000);
  }, [patternText, controllerReady]);

  useEffect(() => {
    controllerRef.current?.setThinking(thinking);
  }, [thinking]);

  useEffect(() => {
    if (effectReplayToken > 0) controllerRef.current?.replayReveal();
  }, [effectReplayToken]);

  return (
    <div className="avatar-wrap">
      <div ref={hostRef} className="avatar-host" aria-label="SVGアバター" />
      {loadError && <p className="avatar-error">{loadError}</p>}
    </div>
  );
}
