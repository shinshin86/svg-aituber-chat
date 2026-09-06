/**
 * YouTube Live Chat service.
 *
 * This implementation adapts the structure of the official AITuber OnAir
 * React PSD example:
 * https://github.com/shinshin86/aituber-onair/tree/main/packages/core/examples/react-psd-app
 *
 * It resolves the active live chat, pages through comments, and keeps bounded
 * duplicate-filtering state per broadcast. The referenced example is available
 * under the MIT License.
 */

export interface YouTubeChatMessage {
  id: string;
  userName: string;
  userIconUrl: string;
  userComment: string;
  publishedAt: string;
}

interface LiveChatState {
  nextPageToken: string;
  processedCommentIds: Set<string>;
  processedCommentHashes: Set<string>;
  lastFetchTime: number;
  lastCleanupTime: number;
}

interface YouTubeApiErrorBody {
  error?: {
    message?: string;
  };
}

interface VideoListResponse extends YouTubeApiErrorBody {
  items?: Array<{
    liveStreamingDetails?: {
      activeLiveChatId?: string;
    };
  }>;
}

interface LiveChatListResponse extends YouTubeApiErrorBody {
  nextPageToken?: string;
  pollingIntervalMillis?: number;
  items?: Array<{
    id?: string;
    authorDetails?: {
      displayName?: string;
      profileImageUrl?: string;
    };
    snippet?: {
      publishedAt?: string;
      textMessageDetails?: { messageText?: string };
      superChatDetails?: { userComment?: string };
    };
  }>;
}

const DEFAULT_TIME_LIMIT_MINUTES = 10;
const MAX_COMMENT_IDS = 1000;
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const STALE_STATE_INTERVAL = 60 * 60 * 1000;

const liveChatStates = new Map<string, LiveChatState>();
const pollingIntervals = new Map<string, number>();

function getLiveChatState(liveId: string): LiveChatState {
  const current = liveChatStates.get(liveId);
  if (current) return current;

  const created: LiveChatState = {
    nextPageToken: '',
    processedCommentIds: new Set(),
    processedCommentHashes: new Set(),
    lastFetchTime: Date.now(),
    lastCleanupTime: 0,
  };
  liveChatStates.set(liveId, created);
  return created;
}

function generateCommentHash(content: string, userName: string): string {
  return `${userName}:${content}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isWithinTimeLimit(publishedAt: string, timeLimitMinutes: number): boolean {
  const commentTime = new Date(publishedAt).getTime();
  return Number.isFinite(commentTime) && Date.now() - commentTime < timeLimitMinutes * 60 * 1000;
}

function cleanupOldStates(): void {
  const now = Date.now();
  for (const [liveId, state] of liveChatStates.entries()) {
    if (now - state.lastFetchTime > STALE_STATE_INTERVAL) {
      liveChatStates.delete(liveId);
      pollingIntervals.delete(liveId);
    }
  }
}

function cleanupOldCommentIds(state: LiveChatState): void {
  const now = Date.now();
  if (now - state.lastCleanupTime < CLEANUP_INTERVAL) return;

  if (state.processedCommentIds.size > MAX_COMMENT_IDS) {
    state.processedCommentIds.clear();
    state.processedCommentHashes.clear();
  }
  state.lastCleanupTime = now;
}

function youtubeApiError(response: Response, body: YouTubeApiErrorBody): Error {
  const detail = body.error?.message?.trim();
  return new Error(detail || `YouTube APIへの接続に失敗しました（HTTP ${response.status}）。`);
}

export function normalizeYouTubeLiveId(input: string): string {
  const value = input.trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) return value;

  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    if (hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] ?? '';
    if (hostname !== 'youtube.com' && hostname !== 'm.youtube.com') return '';

    const queryId = url.searchParams.get('v');
    if (queryId) return queryId;
    const segments = url.pathname.split('/').filter(Boolean);
    if (['live', 'embed', 'shorts'].includes(segments[0] ?? '')) return segments[1] ?? '';
  } catch {
    return '';
  }
  return '';
}

export async function getLiveChatId(liveId: string, apiKey: string): Promise<string> {
  const params = new URLSearchParams({
    part: 'liveStreamingDetails',
    id: liveId,
    key: apiKey,
  });
  const response = await fetch(`https://youtube.googleapis.com/youtube/v3/videos?${params}`);
  const body = (await response.json()) as VideoListResponse;
  if (!response.ok || body.error) throw youtubeApiError(response, body);

  const activeLiveChatId = body.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
  if (!activeLiveChatId) {
    throw new Error('配信中のYouTubeライブチャットを確認できません。動画IDと配信状態を確認してください。');
  }
  return activeLiveChatId;
}

export async function retrieveLiveComments(
  liveId: string,
  activeLiveChatId: string,
  apiKey: string,
  onComments: (comments: YouTubeChatMessage[]) => void,
  timeLimitMinutes: number = DEFAULT_TIME_LIMIT_MINUTES,
): Promise<number> {
  const state = getLiveChatState(liveId);
  const params = new URLSearchParams({
    liveChatId: activeLiveChatId,
    part: 'authorDetails,snippet',
    key: apiKey,
  });
  if (state.nextPageToken) params.set('pageToken', state.nextPageToken);

  const response = await fetch(`https://youtube.googleapis.com/youtube/v3/liveChat/messages?${params}`);
  const body = (await response.json()) as LiveChatListResponse;
  if (!response.ok || body.error) throw youtubeApiError(response, body);

  if (body.pollingIntervalMillis) pollingIntervals.set(liveId, body.pollingIntervalMillis);
  state.nextPageToken = body.nextPageToken ?? '';
  state.lastFetchTime = Date.now();

  const newComments = (body.items ?? []).flatMap<YouTubeChatMessage>((item) => {
    const id = item.id?.trim() ?? '';
    const userName = item.authorDetails?.displayName?.trim() ?? '';
    const publishedAt = item.snippet?.publishedAt ?? '';
    const userComment = (
      item.snippet?.textMessageDetails?.messageText ??
      item.snippet?.superChatDetails?.userComment ??
      ''
    ).trim();
    if (!id || !userName || !userComment || !isWithinTimeLimit(publishedAt, timeLimitMinutes)) return [];

    const hash = generateCommentHash(userComment, userName);
    if (state.processedCommentIds.has(id) || state.processedCommentHashes.has(hash)) {
      state.processedCommentIds.add(id);
      return [];
    }

    state.processedCommentIds.add(id);
    state.processedCommentHashes.add(hash);
    return [{
      id,
      userName,
      userIconUrl: item.authorDetails?.profileImageUrl ?? '',
      userComment,
      publishedAt,
    }];
  });

  if (newComments.length > 0) onComments(newComments);
  cleanupOldCommentIds(state);
  cleanupOldStates();
  return pollingIntervals.get(liveId) ?? 0;
}

export async function fetchAndProcessComments(
  liveId: string,
  apiKey: string,
  onComments: (comments: YouTubeChatMessage[]) => void,
  timeLimitMinutes: number = DEFAULT_TIME_LIMIT_MINUTES,
): Promise<number> {
  if (!apiKey || !liveId) return 0;
  const liveChatId = await getLiveChatId(liveId, apiKey);
  return retrieveLiveComments(liveId, liveChatId, apiKey, onComments, timeLimitMinutes);
}

export function resetYouTubeCommentState(liveId?: string): void {
  if (liveId) {
    liveChatStates.delete(liveId);
    pollingIntervals.delete(liveId);
    return;
  }
  liveChatStates.clear();
  pollingIntervals.clear();
}
