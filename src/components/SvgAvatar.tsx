import { useEffect, useRef, useState } from 'react';
import avatarUrl from '../../miko.svg?url';
import { createSvgAvatar } from '../avatar/createSvgAvatar.js';
import type { AvatarSettings } from '../types/settings';

interface AvatarController {
  counts: unknown;
  setVoiceLevel: (value: number, isSpeaking: boolean) => void;
  setOptions: (options: Record<string, number | boolean>) => void;
  setEffects: (settings: AvatarSettings) => void;
  replayReveal: () => void;
  destroy: () => void;
}

interface SvgAvatarProps {
  settings: AvatarSettings;
  mouthOpen: number;
  isSpeaking: boolean;
  effectReplayToken: number;
}

export function SvgAvatar({ settings, mouthOpen, isSpeaking, effectReplayToken }: SvgAvatarProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<AvatarController | null>(null);
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
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setVoiceLevel(mouthOpen, isSpeaking);
  }, [isSpeaking, mouthOpen]);

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
    });
    controllerRef.current?.setEffects(settings);
  }, [settings]);

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
