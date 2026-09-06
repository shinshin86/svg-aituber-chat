import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAndProcessComments,
  normalizeYouTubeLiveId,
  resetYouTubeCommentState,
  type YouTubeChatMessage,
} from '../services/youtube/youtubeService';
import { useInterval } from './useInterval';

export type YouTubeConnectionStatus = 'idle' | 'connecting' | 'watching' | 'error';

interface UseYoutubeCommentsParams {
  youtubeLiveId: string;
  youtubeApiKey: string;
  isEnabled: boolean;
  intervalMs?: number;
  timeLimitMinutes?: number;
  onComments: (comments: YouTubeChatMessage[]) => void;
}

export function useYoutubeComments({
  youtubeLiveId,
  youtubeApiKey,
  isEnabled,
  intervalMs = 20_000,
  timeLimitMinutes = 10,
  onComments,
}: UseYoutubeCommentsParams) {
  const liveId = normalizeYouTubeLiveId(youtubeLiveId);
  const onCommentsRef = useRef(onComments);
  const fetchingRef = useRef(false);
  const requestVersionRef = useRef(0);
  const [apiRecommendedIntervalMs, setApiRecommendedIntervalMs] = useState(0);
  const [status, setStatus] = useState<YouTubeConnectionStatus>('idle');
  const [error, setError] = useState('');
  const [lastComment, setLastComment] = useState<YouTubeChatMessage | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);
  onCommentsRef.current = onComments;

  const fetchComments = useCallback(async () => {
    if (!isEnabled || !liveId || !youtubeApiKey || fetchingRef.current) return;
    const version = requestVersionRef.current;
    fetchingRef.current = true;
    setStatus((current) => current === 'watching' ? current : 'connecting');
    try {
      const recommended = await fetchAndProcessComments(
        liveId,
        youtubeApiKey,
        (comments) => {
          if (version !== requestVersionRef.current) return;
          setLastComment(comments.at(-1) ?? null);
          onCommentsRef.current(comments);
        },
        timeLimitMinutes,
      );
      if (version !== requestVersionRef.current) return;
      setApiRecommendedIntervalMs(recommended);
      setLastFetchAt(Date.now());
      setError('');
      setStatus('watching');
    } catch (caught) {
      if (version !== requestVersionRef.current) return;
      setError(caught instanceof Error ? caught.message : 'YouTubeコメントを取得できませんでした。');
      setStatus('error');
    } finally {
      fetchingRef.current = false;
    }
  }, [isEnabled, liveId, timeLimitMinutes, youtubeApiKey]);

  useEffect(() => {
    requestVersionRef.current += 1;
    const currentLiveId = liveId;
    if (!isEnabled || !liveId || !youtubeApiKey) {
      setStatus('idle');
      setError('');
      setApiRecommendedIntervalMs(0);
      return;
    }

    resetYouTubeCommentState(currentLiveId);
    void fetchComments();
    return () => {
      requestVersionRef.current += 1;
      resetYouTubeCommentState(currentLiveId);
    };
  }, [fetchComments, isEnabled, liveId, youtubeApiKey]);

  const effectiveIntervalMs = Math.max(intervalMs, apiRecommendedIntervalMs);
  useInterval(
    () => void fetchComments(),
    isEnabled && liveId && youtubeApiKey ? effectiveIntervalMs : null,
  );

  return {
    status,
    error,
    lastComment,
    lastFetchAt,
    effectiveIntervalMs,
    normalizedLiveId: liveId,
  };
}
