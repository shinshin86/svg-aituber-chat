import { useCallback, useEffect, useState } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { StreamSettingsPanel } from './components/StreamSettingsPanel';
import { SvgAvatar } from './components/SvgAvatar';
import { useAituberCore } from './hooks/useAituberCore';
import { useAudioLipsync } from './hooks/useAudioLipsync';
import { useLiveCommentQueue } from './hooks/useLiveCommentQueue';
import { useSettings } from './hooks/useSettings';
import { useVoiceTest } from './hooks/useVoiceTest';
import { useYoutubeComments } from './hooks/useYoutubeComments';
import { LLM_PROVIDERS, TTS_ENGINES } from './lib/providerCatalog';

type Tab = 'chat' | 'settings' | 'stream';

export default function App() {
  const [tab, setTab] = useState<Tab>('chat');
  const [avatarEffectReplayToken, setAvatarEffectReplayToken] = useState(0);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const settingsState = useSettings();
  const audio = useAudioLipsync();
  const voiceTest = useVoiceTest(settingsState.settings, audio.unlock, audio.play);
  const core = useAituberCore({
    settings: settingsState.settings,
    onAudioPlay: audio.play,
  });

  const handleYouTubeCommentSelected = useCallback(() => {
    if (
      settingsState.settings.stream.playAvatarEffectOnComment &&
      settingsState.settings.avatar.reveal !== 'none'
    ) {
      setAvatarEffectReplayToken((current) => current + 1);
    }
  }, [
    settingsState.settings.avatar.reveal,
    settingsState.settings.stream.playAvatarEffectOnComment,
  ]);

  const liveCommentQueue = useLiveCommentQueue({
    enabled: settingsState.settings.stream.youtubeEnabled,
    isProcessing: core.isProcessing,
    isSpeaking: core.speechActive || audio.isSpeaking,
    processChat: core.processChat,
    onCommentSelected: handleYouTubeCommentSelected,
  });

  const youtube = useYoutubeComments({
    youtubeLiveId: settingsState.settings.stream.youtubeLiveId,
    youtubeApiKey: settingsState.settings.stream.youtubeApiKey,
    isEnabled: settingsState.settings.stream.youtubeEnabled,
    intervalMs: settingsState.settings.stream.youtubeCommentIntervalMs,
    onComments: liveCommentQueue.enqueue,
  });

  const handleSend = useCallback(
    async (message: string) => {
      voiceTest.stop();
      await audio.unlock();
      audio.stop();
      await core.processChat(message);
    },
    [audio, core, voiceTest],
  );

  const handleStreamEnabled = useCallback(async (enabled: boolean) => {
    if (enabled) {
      voiceTest.stop();
      await audio.unlock();
    }
    settingsState.updateStream({ youtubeEnabled: enabled });
  }, [audio.unlock, settingsState.updateStream, voiceTest.stop]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPanelCollapsed(true);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    const debugWindow = window as typeof window & {
      __svgAituberTest?: {
        playTestAudio: () => Promise<void>;
        getAudioState: () => { mouthOpen: number; mouthWidth: number; isSpeaking: boolean; rms: number };
      };
    };
    debugWindow.__svgAituberTest = {
      playTestAudio: voiceTest.testVoice,
      getAudioState: () => ({
        mouthOpen: audio.mouthOpen,
        mouthWidth: audio.mouthWidth,
        isSpeaking: audio.isSpeaking,
        rms: audio.rms,
      }),
    };
    return () => {
      delete debugWindow.__svgAituberTest;
    };
  }, [audio.isSpeaking, audio.mouthOpen, audio.mouthWidth, audio.rms, voiceTest.testVoice]);

  const llmLabel =
    LLM_PROVIDERS.find((item) => item.value === settingsState.settings.llm.provider)?.label ??
    settingsState.settings.llm.provider;
  const ttsLabel =
    TTS_ENGINES.find((item) => item.value === settingsState.settings.tts.engine)?.label ??
    settingsState.settings.tts.engine;
  const status = audio.isSpeaking
    ? '音声を再生中'
    : voiceTest.isTesting
      ? 'テスト音声を再生中'
    : liveCommentQueue.activeComment
      ? 'YouTubeコメントに返答中'
    : core.isProcessing
      ? '返答を生成中'
      : core.configurationMessage
        ? '設定待ち'
        : '待機中';
  const debugBackground = new URLSearchParams(window.location.search).get('bg');
  const background = ['white', 'dark', 'green'].includes(debugBackground || '')
    ? debugBackground
    : settingsState.settings.avatar.background;

  return (
    <div className={`app-shell ${isPanelCollapsed ? 'panel-collapsed' : ''}`}>
      <main className={`stage background-${background} mood-${settingsState.settings.avatar.colorMood}`}>
        <header className="stage-header">
          <div className="brand-mark">AO</div>
          <div>
            <p className="brand-title">SVG AITuber Chat</p>
            <p className="brand-subtitle">Powered by AITuber OnAir Core</p>
          </div>
        </header>

        <div className={`status-pill ${audio.isSpeaking ? 'speaking' : ''}`}>
          <span className="status-dot" />
          {status}
        </div>

        <SvgAvatar
          settings={settingsState.settings.avatar}
          mouthOpen={audio.mouthOpen}
          mouthWidth={audio.mouthWidth}
          isSpeaking={audio.isSpeaking}
          thinking={core.isProcessing}
          emotion={core.emotion}
          effectReplayToken={avatarEffectReplayToken}
        />

        <div className="voice-meter" aria-label={`音声レベル ${Math.round(audio.mouthOpen * 100)}%`}>
          <span>VOICE</span>
          <div><i style={{ transform: `scaleX(${Math.max(audio.mouthOpen, 0.025)})` }} /></div>
        </div>

        <div className="provider-strip">
          <span><b>LLM</b>{llmLabel}</span>
          <span><b>VOICE</b>{ttsLabel}</span>
        </div>
      </main>

      <button
        className="panel-visibility-toggle"
        type="button"
        aria-controls="side-panel"
        aria-expanded={!isPanelCollapsed}
        aria-label={isPanelCollapsed ? '設定パネルを開く' : '設定パネルを閉じる'}
        title={isPanelCollapsed ? '設定パネルを開く' : '設定パネルを閉じる（Esc）'}
        onClick={() => setIsPanelCollapsed((current) => !current)}
      >
        <span aria-hidden="true">{isPanelCollapsed ? '‹' : '›'}</span>
      </button>

      <aside
        id="side-panel"
        className="side-panel"
        aria-hidden={isPanelCollapsed}
        inert={isPanelCollapsed ? true : undefined}
      >
        <nav className="tabs" aria-label="サイドパネル">
          <button className={tab === 'chat' ? 'active' : ''} type="button" onClick={() => setTab('chat')}>チャット</button>
          <button className={tab === 'settings' ? 'active' : ''} type="button" onClick={() => setTab('settings')}>設定</button>
          <button className={tab === 'stream' ? 'active' : ''} type="button" onClick={() => setTab('stream')}>配信設定</button>
        </nav>
        {tab === 'chat' ? (
          <ChatPanel
            messages={core.messages}
            partialResponse={core.partialResponse}
            isProcessing={core.isProcessing}
            disabledReason={core.configurationMessage}
            error={core.error}
            onSend={handleSend}
            onClear={core.clearConversation}
          />
        ) : tab === 'settings' ? (
          <SettingsPanel
            settings={settingsState.settings}
            availableModels={settingsState.availableModels}
            onSetProvider={settingsState.setProvider}
            onUpdateLlm={settingsState.updateLlm}
            onSetLlmApiKey={settingsState.setLlmApiKey}
            onSetTtsEngine={settingsState.setTtsEngine}
            onUpdateTtsProfile={settingsState.updateTtsProfile}
            onUpdateAvatar={settingsState.updateAvatar}
            onReplayAvatarEffect={() => setAvatarEffectReplayToken((current) => current + 1)}
            onTestAudio={voiceTest.testVoice}
            isTestingAudio={voiceTest.isTesting}
            testAudioError={voiceTest.error}
          />
        ) : (
          <StreamSettingsPanel
            stream={settingsState.settings.stream}
            isEnabled={settingsState.settings.stream.youtubeEnabled}
            status={youtube.status}
            error={youtube.error}
            coreDisabledReason={core.configurationMessage}
            lastComment={youtube.lastComment}
            lastFetchAt={youtube.lastFetchAt}
            effectiveIntervalMs={youtube.effectiveIntervalMs}
            pendingCount={liveCommentQueue.pendingCount}
            droppedCount={liveCommentQueue.droppedCount}
            activeComment={liveCommentQueue.activeComment}
            onUpdate={settingsState.updateStream}
            onSetEnabled={handleStreamEnabled}
          />
        )}
      </aside>
    </div>
  );
}
