import { normalizeYouTubeLiveId, type YouTubeChatMessage } from '../services/youtube/youtubeService';
import type { YouTubeConnectionStatus } from '../hooks/useYoutubeComments';
import type { AppSettings } from '../types/settings';

const INTERVAL_OPTIONS = [5_000, 10_000, 20_000, 30_000, 60_000] as const;

interface StreamSettingsPanelProps {
  stream: AppSettings['stream'];
  isEnabled: boolean;
  status: YouTubeConnectionStatus;
  error: string;
  coreDisabledReason: string;
  lastComment: YouTubeChatMessage | null;
  lastFetchAt: number | null;
  effectiveIntervalMs: number;
  pendingCount: number;
  droppedCount: number;
  activeComment: YouTubeChatMessage | null;
  onUpdate: (patch: Partial<AppSettings['stream']>) => void;
  onSetEnabled: (enabled: boolean) => Promise<void>;
}

const STATUS_LABELS: Record<YouTubeConnectionStatus, string> = {
  idle: '停止中',
  connecting: '接続中',
  watching: 'コメント取得中',
  error: '接続エラー',
};

export function StreamSettingsPanel({
  stream,
  isEnabled,
  status,
  error,
  coreDisabledReason,
  lastComment,
  lastFetchAt,
  effectiveIntervalMs,
  pendingCount,
  droppedCount,
  activeComment,
  onUpdate,
  onSetEnabled,
}: StreamSettingsPanelProps) {
  const liveId = normalizeYouTubeLiveId(stream.youtubeLiveId);
  const missingConnectionSettings = !stream.youtubeApiKey.trim() || !liveId;
  const cannotStartReason = coreDisabledReason || (missingConnectionSettings
    ? 'YouTube APIキーとライブURLまたは動画IDを入力してください。'
    : '');

  return (
    <section className="settings-panel stream-settings-panel" aria-label="配信設定">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Live connection</p>
          <h2>配信設定</h2>
        </div>
        <span className={`stream-status status-${status}`}>
          <i />{STATUS_LABELS[status]}
        </span>
      </div>

      <div className="stream-intro">
        <span className="youtube-mark" aria-hidden="true">▶</span>
        <div>
          <strong>YouTube Live</strong>
          <p>ライブチャットを取得し、待機中のコメントから順にミコが音声で返答します。</p>
        </div>
      </div>

      <div className="settings-group stream-fields">
        <label className="field">
          <span>YouTube Data APIキー</span>
          <input
            type="password"
            value={stream.youtubeApiKey}
            onChange={(event) => onUpdate({ youtubeApiKey: event.target.value })}
            placeholder="AIza…"
            autoComplete="off"
            disabled={isEnabled}
          />
          <small>Google CloudでYouTube Data API v3を有効にして発行したキーを使います。</small>
        </label>

        <label className="field">
          <span>ライブURL / 動画ID</span>
          <input
            type="text"
            value={stream.youtubeLiveId}
            onChange={(event) => onUpdate({ youtubeLiveId: event.target.value })}
            placeholder="https://www.youtube.com/watch?v=…"
            autoComplete="off"
            disabled={isEnabled}
          />
          <small>{liveId ? `取得対象ID: ${liveId}` : '配信中のYouTubeライブを指定してください。'}</small>
        </label>

        <label className="field">
          <span>コメント取得間隔</span>
          <select
            value={stream.youtubeCommentIntervalMs}
            onChange={(event) => onUpdate({ youtubeCommentIntervalMs: Number(event.target.value) })}
            disabled={isEnabled}
          >
            {INTERVAL_OPTIONS.map((interval) => (
              <option value={interval} key={interval}>{(interval / 1000).toLocaleString()}秒</option>
            ))}
          </select>
          <small>
            接続後はYouTube APIが指定する間隔を優先します
            {isEnabled ? `（現在 ${(effectiveIntervalMs / 1000).toLocaleString()}秒）` : '。'}
          </small>
        </label>

        <label className="check-field stream-effect-toggle">
          <input
            type="checkbox"
            checked={stream.playAvatarEffectOnComment}
            onChange={(event) => onUpdate({ playAvatarEffectOnComment: event.target.checked })}
          />
          <span>コメントへの返答開始時に、選択中の登場演出を再生</span>
        </label>
        <p className="notice">演出の種類は「設定 → アドバンスド演出」で選択します。発話中は既存の口パクと音声連動グローがそのまま動作します。</p>

        {cannotStartReason && !isEnabled && <p className="notice warning">{cannotStartReason}</p>}
        {error && <p className="notice warning">YouTube接続に失敗しました：{error}</p>}

        <button
          className={`stream-toggle-button ${isEnabled ? 'is-active' : ''}`}
          type="button"
          onClick={() => void onSetEnabled(!isEnabled)}
          disabled={!isEnabled && Boolean(cannotStartReason)}
        >
          {isEnabled ? 'コメント取得を停止' : 'コメント取得を開始'}
        </button>
        <small className="stream-audio-note">開始操作でブラウザの音声再生も有効にします。</small>
      </div>

      <div className="stream-monitor" aria-live="polite">
        <div className="stream-monitor-heading">
          <div>
            <p className="eyebrow">Monitor</p>
            <h3>コメント受信状況</h3>
          </div>
          <span>待機 {pendingCount}件</span>
        </div>
        {activeComment ? (
          <div className="stream-comment is-active">
            <strong>{activeComment.userName}</strong>
            <p>{activeComment.userComment}</p>
            <small>このコメントに返答しています</small>
          </div>
        ) : lastComment ? (
          <div className="stream-comment">
            <strong>{lastComment.userName}</strong>
            <p>{lastComment.userComment}</p>
            <small>最後に受信したコメント</small>
          </div>
        ) : (
          <div className="stream-empty-comment">受信したコメントはまだありません。</div>
        )}
        <div className="stream-monitor-meta">
          <span>{lastFetchAt ? `最終確認 ${new Date(lastFetchAt).toLocaleTimeString('ja-JP')}` : '未接続'}</span>
          {droppedCount > 0 && <span>キュー上限により除外 {droppedCount}件</span>}
        </div>
      </div>

      <p className="storage-note">YouTube APIキーを含む設定は、このローカルデモのブラウザ内に保存されます。キーをソースコードへ記載しないでください。</p>
    </section>
  );
}
