# SVG AITuber Chat

![ミコが音声とリップシンクで返答するSVG AITuber Chatのデモ](./docs/images/svg-aituber-chat-demo.webp)

[English](./README.md) | **日本語**

**SVG AITuber Chat**は、アニメーション付きSVGアバターと、npmで公開されている[`@aituber-onair/core`](https://www.npmjs.com/package/@aituber-onair/core)を組み合わせたローカル向けデモです。テキストチャット、TTS、音声解析によるリップシンク、SVG演出、YouTube Liveコメントへの自動返答に対応しています。

## 主な機能

- AITuber OnAir Coreが対応するLLMとのチャット
- 対応TTSエンジンによる音声返答
- 再生中の実音声を使った口パク
- まばたき、呼吸、首振り、髪揺れのアニメーション
- 線画、ネオン、グリッチ、波打ち、登場アニメーションなどのSVG演出
- YouTube Liveコメントの取得と順番による自動返答
- 配信用に操作パネルを折り畳む表示

## 起動方法

```sh
cd svg-aituber-chat
npm install
npm run dev
```

`http://localhost:5173/`を開き、設定画面でLLMとTTSエンジンを選択して、必要なAPIキーを入力します。

設定はブラウザの`localStorage`に保存されます。このデモはローカル利用を想定しています。公開サービスに発展させる場合は、APIキーをブラウザに保存せず、安全なバックエンド経由でリクエストしてください。

画面中央の矢印ボタン、または`Esc`キーで操作パネルを畳み、SVGアバターを配信画面全体に表示できます。

## YouTube Liveコメント

1. Google CloudでYouTube Data API v3を有効にし、APIキーを作成します。
2. **配信設定**タブにAPIキーとYouTube LiveのURLまたは動画IDを入力します。
3. 取得間隔を選び、コメント取得を開始します。

コメントは最大50件まで待機します。LLMが処理中、または音声が再生中の場合、後から取得したコメントは待機し、古いものから順に処理されます。コメントへの返答開始時に、選択中の登場演出を再生することもできます。

YouTube連携は、[AITuber OnAirのReact PSD Example](https://github.com/shinshin86/aituber-onair/tree/main/packages/core/examples/react-psd-app)の構成と動作を参考に実装しています。

## 音声・口パクテスト

**音声・口パクテスト**ボタンは、選択中のTTSエンジンでテスト文を発話し、返された音声から口の動きを生成します。

- 外部TTSエンジンでは、テスト時に実際のAPIリクエストが発生します。
- Web Speech APIは音声バッファを取得できないため、音声解析型リップシンクに対応しません。
- `none`エンジンは音声を再生しません。
- Fish AudioはローカルのViteプロキシ経由で呼び出されます。ブラウザのCORS制限がある他のプロバイダーも、同様のローカルプロキシが必要になる場合があります。

## Mikoアバター

同梱の`miko.svg`とデモ画像には、AITuber OnAir公式キャラクターのMikoが描かれています。SVGは、このアプリケーションサンプルの一部として同梱するためにベクター化・調整されたアバター素材です。

Miko関連ファイルには、このリポジトリのMIT Licenseは適用されません。利用には[Mikoキャラクター利用ガイドライン](https://miko.aituberonair.com/)が適用されます。ガイドラインでは、ソフトウェア、アプリ、ゲーム、動画、Webサイトなどの作品の一部としての改変・再配布は許可されていますが、素材単体や素材集としての再配布は禁止されています。このリポジトリにおける要約は[MIKO_ASSET_TERMS.md](./MIKO_ASSET_TERMS.md)を参照してください。

## 開発時の確認

```sh
npm run typecheck
npm run test
npm run build
```

## セキュリティ上の注意

- 自分のAPIキーを使用し、リポジトリにはコミットしないでください。
- YouTube Liveコメントは信頼できない外部入力です。このサンプルでは、コメントを会話データとして区切り、モデルに指示として扱わないよう促しています。公開サービスに発展させる場合は、モデレーションと安全対策を追加してください。
- 利用前に、各プロバイダーの料金、データの取り扱い、CORSの要件を確認してください。

## ライセンス

このリポジトリのソースコードは[MIT License](./LICENSE)で利用できます。

Mikoのキャラクター素材はMIT Licenseの対象外であり、[Mikoキャラクター利用ガイドライン](https://miko.aituberonair.com/)が適用されます。
