# SillyTavern Telegram Bridge

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

SillyTavern 向けの Telegram Bridge 配布パッケージです。構成は次の 2 つです。

- `plugins/telegram-bridge` のサーバープラグイン
- `extensions/telegram-bridge` のフロントエンド拡張

このブリッジでできること：

- 1 つの Telegram Bot を SillyTavern に接続する
- フロントエンドから `botToken` と 1 つの認可済み Telegram `Chat ID` を設定する
- 現在リンクする SillyTavern チャットを選ぶ
- 後から Telegram 上で `/chats` と `/bind <number>` を使ってリンク先チャットを切り替える
- Telegram の会話を選択中の SillyTavern チャット文脈に流し込む

## 同梱内容

- `plugins/telegram-bridge`
  `enableServerPlugins: true` を有効にしたときに SillyTavern が読み込むサーバープラグインです。
- `extensions/telegram-bridge`
  SillyTavern の拡張パネルに表示されるフロントエンド拡張です。
- `install.ps1`
  既存の SillyTavern 環境へ両方をコピーする Windows 用インストールスクリプトです。

## 動作要件

- サーバープラグインが有効な SillyTavern
- `@BotFather` で作成した Telegram Bot
- SillyTavern 側で設定済みの有効な chat-completions プロバイダー

## クイックスタート

### Windows

実行例：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -SillyTavernRoot "E:\Path\To\SillyTavern"
```

任意パラメータ：

- `-UserHandle default-user`
- `-Force`

### 手動インストール

1. `plugins/telegram-bridge` を SillyTavern の `plugins` フォルダーへコピーします。
2. `extensions/telegram-bridge` を `data/<your-user-handle>/extensions/telegram-bridge` へコピーします。
3. SillyTavern の `config.yaml` を開き、次を有効にします。

```yaml
enableServerPlugins: true
```

4. SillyTavern を再起動します。
5. 拡張パネルで `Telegram Bridge` を有効化します。

## フロントエンド設定

インストール後、SillyTavern の `Telegram Bridge` 設定ドロワーを開いて次を行います。

1. ブリッジを有効化する
2. Telegram の `botToken` を入力する
3. 自分の Telegram `Chat ID` を入力する
4. 既定でリンクする SillyTavern チャットを選ぶ
5. 保存する

Telegram Chat ID の確認方法：

1. Bot に `/start` を送る
2. Bot に `/whoami` を送る
3. 返信に表示された `Chat ID` を控える

## Telegram コマンド

Bot は次のコマンドに対応しています。

- `/help`
- `/whoami`
- `/status`
- `/currentchat`
- `/chats`
- `/bind <number>`
- `/unbind`
- `/reset`

おすすめの流れ：

1. `/chats` を送る
2. 使いたい SillyTavern チャットの番号を確認する
3. `/bind <number>` を送る

これでフロントエンド設定画面に戻らなくても、Telegram 上で現在のリンク先チャットを切り替えられます。

## プロジェクト構成

```text
SillyTavern-TelegramBridge/
|- plugins/
|  \- telegram-bridge/
|     |- index.mjs
|     |- package.json
|     \- README.md
|- extensions/
|  \- telegram-bridge/
|     |- index.js
|     |- manifest.json
|     |- settings.html
|     \- style.css
|- install.ps1
|- CHANGELOG.md
|- CONTRIBUTING.md
|- README.md
|- README.zh-CN.md
\- README.ja.md
```

## API ルート

サーバープラグインは次の配下にエンドポイントを公開します。

`/api/plugins/telegram-bridge`

利用可能なエンドポイント：

- `GET /status`
- `GET /config`
- `GET /chats`
- `POST /config`
- `POST /select-chat`
- `POST /reset`

## トラブルシューティング

### 拡張が SillyTavern に表示されない

- フロントエンドファイルが `data/<user>/extensions/telegram-bridge` にコピーされているか確認してください
- 拡張マネージャーで無効化されていないか確認してください
- インストール後にブラウザを更新してください

### プラグイン API ルートが存在しない

- `plugins/telegram-bridge` が SillyTavern のルートに配置されているか確認してください
- `config.yaml` で `enableServerPlugins: true` が有効か確認してください
- インストール後に SillyTavern を再起動してください

### Telegram で bridge error が返る

- bot token が有効か確認してください
- Telegram Chat ID が認可されているか確認してください
- SillyTavern の上流モデル接続が正常か確認してください
- `/api/plugins/telegram-bridge/status` の `lastError` を確認してください

## 開発メモ

- サーバープラグインは SillyTavern の server plugin loader 向けです。
- フロントエンド拡張は SillyTavern のユーザー単位またはグローバル third-party extension 方式に対応しています。
- 現時点では明示的なオープンソースライセンスはありません。広く再配布する場合は LICENSE の追加を推奨します。

## コントリビュート

[CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

## 変更履歴

[CHANGELOG.md](./CHANGELOG.md) を参照してください。
