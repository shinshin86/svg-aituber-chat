import { useCallback, useEffect, useRef, useState } from 'react';
import { estimateMouthShape } from '../lib/lipsync';

const SMOOTH_FACTOR = 0.48;
const RMS_FLOOR = 0.008;
const RMS_CEILING = 0.12;

export function useAudioLipsync() {
  const [mouthOpen, setMouthOpen] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [rms, setRms] = useState(0);
  const [mouthWidth, setMouthWidth] = useState(1);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef(0);
  const smoothedRef = useRef(0);
  const widthRef = useRef(1);

  const getContext = useCallback(() => {
    if (!contextRef.current || contextRef.current.state === 'closed') {
      contextRef.current = new AudioContext();
    }
    return contextRef.current;
  }, []);

  const resetMeter = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = 0;
    analyserRef.current = null;
    smoothedRef.current = 0;
    widthRef.current = 1;
    setMouthOpen(0);
    setMouthWidth(1);
    setRms(0);
    setIsSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // The source has already ended.
      }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    resetMeter();
  }, [resetMeter]);

  const unlock = useCallback(async () => {
    const context = getContext();
    if (context.state === 'suspended') await context.resume();
  }, [getContext]);

  const play = useCallback(
    async (arrayBuffer: ArrayBuffer): Promise<void> => {
      stop();
      // Core's `none` engine is a null object that returns a zero-byte buffer.
      // Complete immediately instead of trying to decode missing audio.
      if (arrayBuffer.byteLength === 0) return;
      const context = getContext();
      if (context.state === 'suspended') await context.resume();
      const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
      const source = context.createBufferSource();
      const gain = context.createGain();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.buffer = audioBuffer;
      source.connect(gain);
      gain.connect(analyser);
      analyser.connect(context.destination);
      sourceRef.current = source;
      analyserRef.current = analyser;
      setIsSpeaking(true);

      const samples = new Float32Array(analyser.fftSize);
      const frequencies = new Float32Array(analyser.frequencyBinCount);
      const tick = () => {
        const currentAnalyser = analyserRef.current;
        if (!currentAnalyser || sourceRef.current !== source) return;
        currentAnalyser.getFloatTimeDomainData(samples);
        currentAnalyser.getFloatFrequencyData(frequencies);
        let sumSquares = 0;
        for (const sample of samples) sumSquares += sample * sample;
        const currentRms = Math.sqrt(sumSquares / samples.length);
        smoothedRef.current =
          smoothedRef.current * SMOOTH_FACTOR + currentRms * (1 - SMOOTH_FACTOR);
        const normalized = Math.min(
          Math.max((smoothedRef.current - RMS_FLOOR) / (RMS_CEILING - RMS_FLOOR), 0),
          1,
        );
        const naturalOpen = Math.pow(normalized, 0.68);
        const shape = estimateMouthShape(frequencies, context.sampleRate, currentAnalyser.fftSize);
        setRms(smoothedRef.current);
        const activity = Math.min(Math.max((normalized - 0.05) / 0.2, 0), 1);
        const widthTarget = 1 + (shape.width - 1) * activity;
        widthRef.current = widthRef.current * 0.5 + widthTarget * 0.5;
        setMouthOpen(Math.min(naturalOpen * (0.9 + shape.open * 0.1), 1));
        setMouthWidth(widthRef.current);
        animationRef.current = requestAnimationFrame(tick);
      };
      animationRef.current = requestAnimationFrame(tick);

      await new Promise<void>((resolve) => {
        source.onended = () => {
          if (sourceRef.current === source) {
            sourceRef.current = null;
            resetMeter();
          }
          resolve();
        };
        source.start();
      });
    },
    [getContext, resetMeter, stop],
  );

  useEffect(() => {
    return () => {
      stop();
      if (contextRef.current && contextRef.current.state !== 'closed') {
        void contextRef.current.close();
      }
    };
  }, [stop]);

  return { mouthOpen, mouthWidth, isSpeaking, rms, play, stop, unlock };
}
