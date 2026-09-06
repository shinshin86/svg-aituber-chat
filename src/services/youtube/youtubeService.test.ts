import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeYouTubeLiveId,
  resetYouTubeCommentState,
  retrieveLiveComments,
} from './youtubeService';

describe('normalizeYouTubeLiveId', () => {
  it.each([
    ['abc123', 'abc123'],
    ['https://www.youtube.com/watch?v=abc123', 'abc123'],
    ['https://youtube.com/live/abc123?feature=share', 'abc123'],
    ['https://youtu.be/abc123?t=10', 'abc123'],
    ['https://www.youtube.com/embed/abc123', 'abc123'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeYouTubeLiveId(input)).toBe(expected);
  });

  it('rejects unrelated URLs', () => {
    expect(normalizeYouTubeLiveId('https://example.com/watch?v=abc123')).toBe('');
  });
});

describe('retrieveLiveComments', () => {
  afterEach(() => {
    resetYouTubeCommentState();
    vi.unstubAllGlobals();
  });

  it('forwards a comment and returns the API recommended polling interval', async () => {
    const onComments = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        nextPageToken: 'next-page',
        pollingIntervalMillis: 12_000,
        items: [{
          id: 'comment-1',
          authorDetails: { displayName: '視聴者A', profileImageUrl: 'https://example.com/a.png' },
          snippet: {
            publishedAt: new Date().toISOString(),
            textMessageDetails: { messageText: 'こんにちは' },
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const interval = await retrieveLiveComments('live-1', 'chat-1', 'api-key', onComments);

    expect(interval).toBe(12_000);
    expect(onComments).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'comment-1', userName: '視聴者A', userComment: 'こんにちは' }),
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('part=authorDetails%2Csnippet');
  });

  it('does not forward the same comment twice', async () => {
    const onComments = vi.fn();
    const item = {
      id: 'comment-1',
      authorDetails: { displayName: '視聴者A', profileImageUrl: '' },
      snippet: {
        publishedAt: new Date().toISOString(),
        textMessageDetails: { messageText: '同じコメント' },
      },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ nextPageToken: 'next-page', items: [item] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ nextPageToken: 'another-page', items: [item] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await retrieveLiveComments('live-1', 'chat-1', 'api-key', onComments);
    await retrieveLiveComments('live-1', 'chat-1', 'api-key', onComments);

    expect(onComments).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[1][0])).toContain('pageToken=next-page');
  });
});
