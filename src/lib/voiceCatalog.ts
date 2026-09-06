import type { VoiceEngineVoice } from '@aituber-onair/core';
import type { TtsEngine } from '../types/settings';

const options = (entries: ReadonlyArray<readonly [string, string]>): VoiceEngineVoice[] =>
  entries.map(([id, label]) => ({ id, label }));

// Presets for engines that do not expose a dynamic speaker-list API.
// These match the presets used by the official AITuber OnAir Voice React example.
const STATIC_VOICE_OPTIONS: Partial<Record<TtsEngine, VoiceEngineVoice[]>> = {
  openai: options([
    ['alloy', 'Alloy'], ['ash', 'Ash'], ['coral', 'Coral'], ['echo', 'Echo'],
    ['fable', 'Fable'], ['onyx', 'Onyx'], ['nova', 'Nova'], ['sage', 'Sage'],
    ['shimmer', 'Shimmer'],
  ]),
  geminiTts: options([
    ['Zephyr', 'Zephyr — 明るい'], ['Puck', 'Puck — 快活'],
    ['Charon', 'Charon — 説明的'], ['Kore', 'Kore — 芯が強い'],
    ['Fenrir', 'Fenrir — 興奮気味'], ['Leda', 'Leda — 若々しい'],
    ['Orus', 'Orus — 堂々'], ['Aoede', 'Aoede — 軽やか'],
    ['Callirrhoe', 'Callirrhoe — おおらか'], ['Autonoe', 'Autonoe — 明るい'],
    ['Enceladus', 'Enceladus — 息づかい豊か'], ['Iapetus', 'Iapetus — 明瞭'],
    ['Umbriel', 'Umbriel — おおらか'], ['Algieba', 'Algieba — 滑らか'],
    ['Despina', 'Despina — 滑らか'], ['Erinome', 'Erinome — 明瞭'],
    ['Algenib', 'Algenib — ハスキー'], ['Rasalgethi', 'Rasalgethi — 説明的'],
    ['Laomedeia', 'Laomedeia — 快活'], ['Achernar', 'Achernar — 柔らかい'],
    ['Alnilam', 'Alnilam — 芯が強い'], ['Schedar', 'Schedar — 落ち着き'],
    ['Gacrux', 'Gacrux — 成熟'], ['Pulcherrima', 'Pulcherrima — 前向き'],
    ['Achird', 'Achird — 親しみやすい'], ['Zubenelgenubi', 'Zubenelgenubi — カジュアル'],
    ['Vindemiatrix', 'Vindemiatrix — 優しい'], ['Sadachbia', 'Sadachbia — 活発'],
    ['Sadaltager', 'Sadaltager — 知的'], ['Sulafat', 'Sulafat — 温かい'],
  ]),
  openaiCompatible: options([['', 'エンジン既定の話者']]),
  voicepeak: options([
    ['f1', '日本人女性 1'], ['f2', '日本人女性 2'], ['f3', '日本人女性 3'],
    ['m1', '日本人男性 1'], ['m2', '日本人男性 2'], ['m3', '日本人男性 3'],
    ['c', '女の子'],
  ]),
  minimax: options([
    ['Japanese_IntellectualSenior', '日本語 — 知的なシニア'],
    ['Japanese_DecisivePrincess', '日本語 — 凛としたプリンセス'],
    ['Japanese_LoyalKnight', '日本語 — 忠実な騎士'],
    ['Japanese_DominantMan', '日本語 — 威厳ある男性'],
    ['Japanese_SeriousCommander', '日本語 — 真面目な指揮官'],
    ['Japanese_ColdQueen', '日本語 — クールな女王'],
    ['Japanese_DependableWoman', '日本語 — 頼れる女性'],
    ['Japanese_GentleButler', '日本語 — 優しい執事'],
    ['Japanese_KindLady', '日本語 — 親切な女性'],
    ['Japanese_CalmLady', '日本語 — 落ち着いた女性'],
    ['Japanese_OptimisticYouth', '日本語 — 楽観的な若者'],
    ['Japanese_GenerousIzakayaOwner', '日本語 — 気前のよい居酒屋店主'],
    ['Japanese_SportyStudent', '日本語 — スポーティーな学生'],
    ['Japanese_InnocentBoy', '日本語 — 純真な少年'],
    ['Japanese_GracefulMaiden', '日本語 — 上品な少女'],
  ]),
  unrealSpeech: options([['af_bella', 'Bella']]),
  xai: options([
    ['ara', 'Ara'], ['eve', 'Eve'], ['leo', 'Leo'], ['rex', 'Rex'], ['sal', 'Sal'],
  ]),
  gradium: options([
    ['YTpq7expH9539ERJ', 'Emma — 英語（米国・女性）'],
    ['LFZvm12tW_z0xfGo', 'Kent — 英語（米国・男性）'],
    ['jtEKaLYNn6iif5PR', 'Sydney — 英語（米国・女性）'],
    ['KWJiFWu2O9nMPYcR', 'John — 英語（米国・男性）'],
    ['ubuXFxVQwVYnZQhy', 'Eva — 英語（英国・女性）'],
    ['m86j6D7UZpGzHsNu', 'Jack — 英語（英国・男性）'],
  ]),
  webSpeech: options([['', 'ブラウザ既定の音声']]),
};

export function getStaticVoiceOptions(engine: TtsEngine): VoiceEngineVoice[] {
  return [...(STATIC_VOICE_OPTIONS[engine] ?? [])];
}

export function mergeVoiceOptions(
  primary: VoiceEngineVoice[],
  fallback: VoiceEngineVoice[],
): VoiceEngineVoice[] {
  const merged = new Map<string, VoiceEngineVoice>();
  for (const voice of [...primary, ...fallback]) {
    if (!merged.has(voice.id)) merged.set(voice.id, voice);
  }
  return [...merged.values()];
}
