# SillyTavern Telegram Bridge

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Telegram Bridge for SillyTavern, packaged for distribution as:

- a server plugin under `plugins/telegram-bridge`
- a front-end extension under `extensions/telegram-bridge`

This bridge lets you:

- connect one Telegram bot to SillyTavern
- configure `botToken` and a single authorized Telegram `Chat ID` from the front end
- choose which SillyTavern chat is currently linked
- switch the linked SillyTavern chat later from Telegram with `/chats` and `/bind <number>`
- keep Telegram conversations routed through the selected SillyTavern chat context

## What Is Included

- `plugins/telegram-bridge`
  The server plugin loaded by SillyTavern when `enableServerPlugins: true` is enabled.
- `extensions/telegram-bridge`
  The front-end extension shown in the SillyTavern Extensions panel.
- `install.ps1`
  A Windows installer script that copies both parts into an existing SillyTavern installation.

## Requirements

- SillyTavern with server plugins enabled
- A Telegram bot created via `@BotFather`
- A valid upstream chat-completions provider already configured in SillyTavern

## Quick Start

### Windows

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -SillyTavernRoot "E:\Path\To\SillyTavern"
```

Optional parameters:

- `-UserHandle default-user`
- `-Force`

### Manual Install

1. Copy `plugins/telegram-bridge` into your SillyTavern `plugins` folder.
2. Copy `extensions/telegram-bridge` into `data/<your-user-handle>/extensions/telegram-bridge`.
3. Open your SillyTavern `config.yaml` and make sure this is enabled:

```yaml
enableServerPlugins: true
```

4. Restart SillyTavern.
5. Open the Extensions panel and enable `Telegram Bridge`.

## Front-End Setup

After installation, open the `Telegram Bridge` settings drawer in SillyTavern and:

1. enable the bridge
2. paste your Telegram `botToken`
3. enter your Telegram `Chat ID`
4. choose the SillyTavern chat to link by default
5. save

To discover your Telegram chat ID:

1. message your bot with `/start`
2. message your bot with `/whoami`
3. copy the `Chat ID` shown in the bot response

## Telegram Commands

The bot supports these commands directly inside Telegram:

- `/help`
- `/whoami`
- `/status`
- `/currentchat`
- `/chats`
- `/bind <number>`
- `/unbind`
- `/reset`

Recommended flow:

1. send `/chats`
2. note the number of the SillyTavern chat you want
3. send `/bind <number>`

That switches the currently linked SillyTavern chat without opening the front-end settings page.

## Project Layout

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

## API Routes

The server plugin mounts routes under:

`/api/plugins/telegram-bridge`

Available endpoints:

- `GET /status`
- `GET /config`
- `GET /chats`
- `POST /config`
- `POST /select-chat`
- `POST /reset`

## Troubleshooting

### The extension does not appear in SillyTavern

- make sure the front-end files were copied to `data/<user>/extensions/telegram-bridge`
- open the Extensions manager and verify it is not disabled
- refresh the browser after installation

### The plugin API routes do not exist

- make sure `plugins/telegram-bridge` is installed in the SillyTavern root
- make sure `enableServerPlugins: true` is set in `config.yaml`
- restart SillyTavern after installing the plugin

### Telegram responds with bridge errors

- verify the bot token is valid
- verify the Telegram chat ID is authorized
- verify SillyTavern has a working upstream model connection
- inspect `/api/plugins/telegram-bridge/status` for `lastError`

## Development Notes

- The server plugin is designed for SillyTavern's server plugin loader.
- The front-end extension is designed for SillyTavern's user or global third-party extension system.
- This repository currently does not declare an open-source license. Add one before wider redistribution if you want others to reuse or modify it under explicit terms.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
