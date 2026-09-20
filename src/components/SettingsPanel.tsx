import { useEffect } from 'react';
import { useVoiceOptions } from '../hooks/useVoiceOptions';
import { LLM_PROVIDERS, TTS_ENGINES, supportsAudioLipSync } from '../lib/providerCatalog';
import type { AppSettings, LlmProvider, TtsEngine, TtsProfile } from '../types/settings';

interface SettingsPanelProps {
  settings: AppSettings;
  availableModels: string[];
  onSetProvider: (provider: LlmProvider) => void;
  onUpdateLlm: (patch: Partial<AppSettings['llm']>) => void;
  onSetLlmApiKey: (provider: LlmProvider, apiKey: string) => void;
  onSetTtsEngine: (engine: TtsEngine) => void;
  onUpdateTtsProfile: (engine: TtsEngine, patch: Partial<TtsProfile>) => void;
  onUpdateAvatar: (patch: Partial<AppSettings['avatar']>) => void;
  onReplayAvatarEffect: () => void;
  onTestAudio: () => Promise<void>;
  isTestingAudio: boolean;
  testAudioError: string;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password' | 'number';
  placeholder?: string;
  hint?: string;
}

function Field({ label, value, onChange, type = 'text', placeholder, hint }: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}

const REMOTE_KEY_ENGINES: TtsEngine[] = [
  'openai', 'geminiTts', 'openaiCompatible', 'aivisCloud', 'minimax', 'xai',
  'unrealSpeech', 'elevenLabs', 'fishAudio', 'cartesia', 'inworld', 'gradium',
];
const ENDPOINT_ENGINES: TtsEngine[] = [
  'openaiCompatible', 'voicevox', 'voicepeak', 'aivisSpeech', 'unrealSpeech',
  'elevenLabs', 'fishAudio', 'cartesia', 'inworld', 'gradium', 'piperPlus',
];
const MODEL_ENGINES: TtsEngine[] = [
  'geminiTts', 'openaiCompatible', 'elevenLabs', 'fishAudio', 'cartesia', 'inworld',
];
const LANGUAGE_ENGINES: TtsEngine[] = ['geminiTts', 'xai', 'cartesia', 'inworld', 'webSpeech'];
const FORMAT_ENGINES: TtsEngine[] = ['xai', 'elevenLabs', 'fishAudio', 'cartesia', 'inworld', 'gradium'];
const RATE_ENGINES: TtsEngine[] = ['openaiCompatible', 'fishAudio', 'inworld', 'piperPlus', 'webSpeech'];

export function SettingsPanel({
  settings,
  availableModels,
  onSetProvider,
  onUpdateLlm,
  onSetLlmApiKey,
  onSetTtsEngine,
  onUpdateTtsProfile,
  onUpdateAvatar,
  onReplayAvatarEffect,
  onTestAudio,
  isTestingAudio,
  testAudioError,
}: SettingsPanelProps) {
  const provider = settings.llm.provider;
  const providerInfo = LLM_PROVIDERS.find((item) => item.value === provider);
  const engine = settings.tts.engine;
  const engineInfo = TTS_ENGINES.find((item) => item.value === engine);
  const profile = settings.tts.profiles[engine];
  const updateProfile = (patch: Partial<TtsProfile>) => onUpdateTtsProfile(engine, patch);
  const voiceOptions = useVoiceOptions(settings);
  const selectedVoice = voiceOptions.voices.some((voice) => voice.id === profile.speaker)
    ? profile.speaker
    : (voiceOptions.voices[0]?.id ?? '');

  useEffect(() => {
    if (
      engine !== 'none' &&
      engine !== 'piperPlus' &&
      voiceOptions.voices.length > 0 &&
      !voiceOptions.voices.some((voice) => voice.id === profile.speaker)
    ) {
      onUpdateTtsProfile(engine, { speaker: voiceOptions.voices[0].id });
    }
  }, [engine, onUpdateTtsProfile, profile.speaker, voiceOptions.voices]);

  const voiceSelectPlaceholder = voiceOptions.isLoading
    ? '話者一覧を取得中…'
    : voiceOptions.needsApiKey
      ? 'APIキーを入力してください'
      : voiceOptions.error
        ? '話者一覧を取得できません'
        : '利用できる話者がありません';
  const requiresLoadedVoice = voiceOptions.supportsDynamicList && voiceOptions.voices.length === 0;

  return (
    <section className="settings-panel" aria-label="設定">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Local settings</p>
          <h2>設定</h2>
        </div>
        <span className="local-badge">この端末のみ</span>
      </div>

      <details open>
        <summary>LLM</summary>
        <div className="settings-group">
          <label className="field">
            <span>プロバイダー</span>
            <select value={provider} onChange={(event) => onSetProvider(event.target.value as LlmProvider)}>
              {LLM_PROVIDERS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </label>
          {provider === 'openai-compatible' ? (
            <Field label="モデルID" value={settings.llm.model} onChange={(model) => onUpdateLlm({ model })} />
          ) : (
            <label className="field">
              <span>モデル</span>
              <select value={settings.llm.model} onChange={(event) => onUpdateLlm({ model: event.target.value })}>
                {!availableModels.includes(settings.llm.model) && settings.llm.model && (
                  <option value={settings.llm.model}>{settings.llm.model}</option>
                )}
                {availableModels.map((model) => <option value={model} key={model}>{model}</option>)}
              </select>
            </label>
          )}
          {provider !== 'gemini-nano' && (
            <Field
              label="APIキー"
              type="password"
              value={settings.llm.apiKeys[provider] ?? ''}
              onChange={(apiKey) => onSetLlmApiKey(provider, apiKey)}
              hint={provider === 'openai-compatible' ? '認証不要のローカルサーバーでは空欄で構いません。' : undefined}
            />
          )}
          {provider === 'openai-compatible' && (
            <Field label="Chat Completions URL" value={settings.llm.endpoint} onChange={(endpoint) => onUpdateLlm({ endpoint })} />
          )}
          {providerInfo?.browserNote && <p className="notice">{providerInfo.browserNote}</p>}
          <label className="field">
            <span>システムプロンプト</span>
            <textarea value={settings.llm.systemPrompt} rows={4} onChange={(event) => onUpdateLlm({ systemPrompt: event.target.value })} />
          </label>
        </div>
      </details>

      <details open>
        <summary>TTS</summary>
        <div className="settings-group">
          <label className="field">
            <span>音声エンジン</span>
            <select value={engine} onChange={(event) => onSetTtsEngine(event.target.value as TtsEngine)}>
              {TTS_ENGINES.map((item) => (
                <option value={item.value} key={item.value}>
                  {item.label}{item.lipSync ? '' : '（口パク不可）'}
                </option>
              ))}
            </select>
          </label>
          {!supportsAudioLipSync(engine) && (
            <p className="notice warning">{engineInfo?.note || 'この設定では音声リップシンクを利用できません。'}</p>
          )}
          {engineInfo?.note && supportsAudioLipSync(engine) && <p className="notice">{engineInfo.note}</p>}
          <button
            className="secondary-button voice-test-button"
            type="button"
            onClick={() => void onTestAudio()}
            disabled={engine === 'none' || isTestingAudio || requiresLoadedVoice}
          >
            {isTestingAudio ? 'テスト音声を再生中…' : '音声・口パクテスト'}
          </button>
          {testAudioError && <p className="notice warning">音声テストに失敗しました：{testAudioError}</p>}
          {REMOTE_KEY_ENGINES.includes(engine) && (
            <Field
              label="TTS APIキー"
              type="password"
              value={profile.apiKey}
              onChange={(apiKey) => updateProfile({ apiKey })}
              hint={['openai', 'geminiTts', 'xai'].includes(engine) ? '空欄の場合は同じプロバイダーのLLM APIキーを使います。' : undefined}
            />
          )}
          {ENDPOINT_ENGINES.includes(engine) && (
            <Field label={engine === 'piperPlus' ? 'アセットのベースパス' : 'API URL'} value={profile.endpoint} onChange={(endpoint) => updateProfile({ endpoint })} />
          )}
          {engine !== 'none' && engine !== 'piperPlus' && (
            <label className="field">
              <span>{engine === 'aivisCloud' ? '音声モデル' : '話者'}</span>
              <select
                value={selectedVoice}
                onChange={(event) => updateProfile({ speaker: event.target.value })}
                disabled={voiceOptions.voices.length === 0}
              >
                {voiceOptions.voices.length > 0 ? (
                  voiceOptions.voices.map((voice) => (
                    <option value={voice.id} key={voice.id || 'default'}>{voice.label}</option>
                  ))
                ) : (
                  <option value="">{voiceSelectPlaceholder}</option>
                )}
              </select>
              {voiceOptions.supportsDynamicList && (
                <span className="voice-list-row">
                  <small>
                    {voiceOptions.isLoading
                      ? 'Coreライブラリから取得しています。'
                      : voiceOptions.needsApiKey
                        ? 'APIキー設定後に自動取得します。'
                        : voiceOptions.voices.length > 0
                          ? `${voiceOptions.voices.length}件の話者を取得済み`
                          : '選択したエンジンから話者名を取得します。'}
                  </small>
                  <button
                    className="voice-list-reload"
                    type="button"
                    onClick={() => void voiceOptions.reload()}
                    disabled={voiceOptions.isLoading || voiceOptions.needsApiKey}
                  >
                    再取得
                  </button>
                </span>
              )}
              {voiceOptions.error && <small className="field-error">{voiceOptions.error}</small>}
            </label>
          )}
          {MODEL_ENGINES.includes(engine) && (
            <Field label="モデル" value={profile.model} onChange={(model) => updateProfile({ model })} />
          )}
          {engine === 'minimax' && (
            <Field label="Group ID（任意）" value={profile.groupId} onChange={(groupId) => updateProfile({ groupId })} />
          )}
          {LANGUAGE_ENGINES.includes(engine) && (
            <Field label="言語" value={profile.language} onChange={(language) => updateProfile({ language })} />
          )}
          {FORMAT_ENGINES.includes(engine) && (
            <Field label="出力形式" value={profile.outputFormat} onChange={(outputFormat) => updateProfile({ outputFormat })} />
          )}
          {RATE_ENGINES.includes(engine) && (
            <Field label="話速（任意）" type="number" value={profile.rate} onChange={(rate) => updateProfile({ rate })} />
          )}
          {engine === 'webSpeech' && (
            <div className="field-grid">
              <Field label="Pitch" type="number" value={profile.pitch} onChange={(pitch) => updateProfile({ pitch })} />
              <Field label="Volume" type="number" value={profile.volume} onChange={(volume) => updateProfile({ volume })} />
            </div>
          )}
          {engine === 'piperPlus' && (
            <>
              <Field label="Configファイル" value={profile.modelConfigFile} onChange={(modelConfigFile) => updateProfile({ modelConfigFile })} />
              <Field label="ONNXモデル" value={profile.modelFile} onChange={(modelFile) => updateProfile({ modelFile })} />
              <Field label="Voiceファイル" value={profile.voiceFile} onChange={(voiceFile) => updateProfile({ voiceFile })} />
              <Field label="Noise scale（任意）" type="number" value={profile.noiseScale} onChange={(noiseScale) => updateProfile({ noiseScale })} />
            </>
          )}
        </div>
      </details>

      <details>
        <summary>アバター</summary>
        <div className="settings-group">
          {([
            ['breath', '呼吸'], ['headSway', '首の揺れ'], ['hairSway', '髪の揺れ'],
            ['blink', 'まばたき'], ['mouseFollow', 'マウス追従'], ['debug', 'デバッグ表示'], ['emotionSync', '感情連動表情'], ['autoGesture', '自動ジェスチャー'],
          ] as const).map(([key, label]) => (
            <label className="check-field" key={key}>
              <input type="checkbox" checked={settings.avatar[key]} onChange={(event) => onUpdateAvatar({ [key]: event.target.checked })} />
              <span>{label}</span>
            </label>
          ))}
          <label className="field range-field">
            <span>動きの強さ <b>{settings.avatar.amplitude.toFixed(2)}</b></span>
            <input type="range" min="0" max="2" step="0.05" value={settings.avatar.amplitude} onChange={(event) => onUpdateAvatar({ amplitude: Number(event.target.value) })} />
          </label>
          <label className="field range-field">
            <span>動きの速さ <b>{settings.avatar.speed.toFixed(2)}</b></span>
            <input type="range" min="0.25" max="2" step="0.05" value={settings.avatar.speed} onChange={(event) => onUpdateAvatar({ speed: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>背景</span>
            <select value={settings.avatar.background} onChange={(event) => onUpdateAvatar({ background: event.target.value as AppSettings['avatar']['background'] })}>
              <option value="white">白</option>
              <option value="dark">暗色</option>
              <option value="green">グリーンバック</option>
            </select>
          </label>
        </div>
      </details>

      <details data-testid="advanced-effects">
        <summary>アドバンスド演出</summary>
        <div className="settings-group advanced-effects-group">
          <p className="notice">演出は組み合わせて使えます。初期状態ではすべて通常表示です。</p>
          <label className="field">
            <span>表示スタイル</span>
            <select
              aria-label="表示スタイル"
              value={settings.avatar.visualMode}
              onChange={(event) => onUpdateAvatar({ visualMode: event.target.value as AppSettings['avatar']['visualMode'] })}
            >
              <option value="normal">通常</option>
              <option value="monochrome">モノクロ</option>
              <option value="lineArt">線画</option>
              <option value="neon">ネオン</option>
              <option value="poster">ポスター</option>
              <option value="halftone">ハーフトーン</option>
              <option value="duotone">デュオトーン</option>
            </select>
          </label>
          <label className="field">
            <span>感情色調</span>
            <select
              aria-label="感情色調"
              value={settings.avatar.colorMood}
              onChange={(event) => onUpdateAvatar({ colorMood: event.target.value as AppSettings['avatar']['colorMood'] })}
            >
              <option value="neutral">ニュートラル</option>
              <option value="happy">ハッピー</option>
              <option value="calm">クール</option>
              <option value="dramatic">ドラマチック</option>
              <option value="dreamy">ドリーミー</option>
            </select>
            <small>キャラクターと背景の色調を同時に切り替えます。</small>
          </label>
          <label className="check-field">
            <input type="checkbox" checked={settings.avatar.textPattern} onChange={(event) => onUpdateAvatar({ textPattern: event.target.checked })} />
            <span>コメント文字パターン</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={settings.avatar.audioGlow}
              onChange={(event) => onUpdateAvatar({ audioGlow: event.target.checked })}
            />
            <span>音声連動アウトライングロー</span>
          </label>
          <label className="field">
            <span>白フチ</span>
            <select value={settings.avatar.outline} onChange={(event) => onUpdateAvatar({ outline: event.target.value as AppSettings['avatar']['outline'] })}>
              <option value="none">なし</option>
              <option value="sticker">ステッカー</option>
            </select>
          </label>
          <label className="check-field">
            <input type="checkbox" checked={settings.avatar.rimLight} onChange={(event) => onUpdateAvatar({ rimLight: event.target.checked })} />
            <span>リムライト</span>
          </label>
          <label className="check-field">
            <input type="checkbox" checked={settings.avatar.aura} onChange={(event) => onUpdateAvatar({ aura: event.target.checked })} />
            <span>背後オーラ</span>
          </label>
          <label className="check-field">
            <input type="checkbox" checked={settings.avatar.dropShadow} onChange={(event) => onUpdateAvatar({ dropShadow: event.target.checked })} />
            <span>シルエットの影</span>
          </label>
          <label className="field range-field">
            <span>髪色シフト <b>{settings.avatar.hairHueShift}°</b></span>
            <input type="range" min="-180" max="180" step="1" value={settings.avatar.hairHueShift} onChange={(event) => onUpdateAvatar({ hairHueShift: Number(event.target.value) })} />
          </label>
          <label className="check-field">
            <input type="checkbox" checked={settings.avatar.emotionParticles} onChange={(event) => onUpdateAvatar({ emotionParticles: event.target.checked })} />
            <span>感情パーティクル</span>
          </label>
          <label className="field">
            <span>背景演出</span>
            <select value={settings.avatar.backdrop} onChange={(event) => onUpdateAvatar({ backdrop: event.target.value as AppSettings['avatar']['backdrop'] })}>
              <option value="none">なし</option>
              <option value="focusLines">集中線</option>
              <option value="halftone">ハーフトーン</option>
            </select>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={settings.avatar.glitch}
              onChange={(event) => onUpdateAvatar({ glitch: event.target.checked })}
            />
            <span>色ずれグリッチ</span>
          </label>
          <label className="field">
            <span>輪郭のゆらぎ</span>
            <select
              aria-label="輪郭のゆらぎ"
              value={settings.avatar.distortion}
              onChange={(event) => onUpdateAvatar({ distortion: event.target.value as AppSettings['avatar']['distortion'] })}
            >
              <option value="none">なし</option>
              <option value="cyber">サイバー</option>
              <option value="water">水面</option>
            </select>
          </label>
          <label className="field">
            <span>手描き風のぷるぷる線</span>
            <select
              aria-label="手描き風のぷるぷる線"
              value={settings.avatar.wobble}
              onChange={(event) => onUpdateAvatar({ wobble: event.target.value as AppSettings['avatar']['wobble'] })}
            >
              <option value="none">なし</option>
              <option value="full">全身</option>
              <option value="edge">輪郭のみ</option>
            </select>
            <small>輪郭の揺らぎは軽い更新間隔で動作します。</small>
          </label>
          <label className="field">
            <span>キャラクター内の模様</span>
            <select
              aria-label="キャラクター内の模様"
              value={settings.avatar.pattern}
              onChange={(event) => onUpdateAvatar({ pattern: event.target.value as AppSettings['avatar']['pattern'] })}
            >
              <option value="none">なし</option>
              <option value="aurora">動くオーロラ</option>
              <option value="scanlines">スキャンライン</option>
              <option value="dots">ドット</option>
            </select>
          </label>
          <label className="field">
            <span>髪の模様</span>
            <select
              aria-label="髪の模様"
              value={settings.avatar.hairPattern}
              onChange={(event) => onUpdateAvatar({ hairPattern: event.target.value as AppSettings['avatar']['hairPattern'] })}
            >
              <option value="none">なし</option>
              <option value="stars">星空ドット</option>
              <option value="stripes">流れる光の筋</option>
              <option value="hologram">ホログラム</option>
            </select>
          </label>
          <label className="field">
            <span>登場・切替演出</span>
            <select
              aria-label="登場・切替演出"
              value={settings.avatar.reveal}
              onChange={(event) => onUpdateAvatar({ reveal: event.target.value as AppSettings['avatar']['reveal'] })}
            >
              <option value="none">なし</option>
              <option value="wipe">マスクワイプ</option>
              <option value="iris">円形アイリス</option>
              <option value="draw">線描から登場</option>
              <option value="dissolve">ディゾルブ</option>
            </select>
          </label>
          <button
            className="secondary-button effect-replay-button"
            type="button"
            onClick={onReplayAvatarEffect}
            disabled={settings.avatar.reveal === 'none'}
          >
            登場演出を再生
          </button>
          <label className="field range-field">
            <span>演出の強さ <b>{settings.avatar.effectIntensity.toFixed(2)}</b></span>
            <input
              aria-label="演出の強さ"
              type="range"
              min="0.25"
              max="2"
              step="0.05"
              value={settings.avatar.effectIntensity}
              onChange={(event) => onUpdateAvatar({ effectIntensity: Number(event.target.value) })}
            />
          </label>
        </div>
      </details>

      <p className="storage-note">APIキーを含む設定は、このローカルデモのブラウザ内に保存されます。</p>
    </section>
  );
}
