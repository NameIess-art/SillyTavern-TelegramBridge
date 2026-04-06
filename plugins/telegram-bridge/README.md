# Telegram Bridge Server Plugin

Server plugin for SillyTavern that powers the Telegram Bridge integration.

## Responsibilities

- polls Telegram updates
- authorizes Telegram chats
- forwards messages to the configured upstream chat-completions provider
- appends replies into the linked SillyTavern chat when configured
- supports per-Telegram-chat linked SillyTavern chat mappings
- exposes management endpoints for the front-end extension

## Configuration File

The plugin stores its runtime configuration in:

`data/_plugins/telegram-bridge/config.json`

## API Routes

Mounted under:

`/api/plugins/telegram-bridge`

Available routes:

- `GET /status`
- `GET /config`
- `GET /chats`
- `POST /config`
- `POST /select-chat`
- `POST /reset`

## Expected Setup

- install this plugin into the SillyTavern `plugins` directory
- enable `enableServerPlugins: true` in `config.yaml`
- install the companion front-end extension from this repository
- restart SillyTavern after installation

## Notes

The front-end extension is responsible for configuring:

- whether the bridge is enabled
- the Telegram bot token
- authorized Telegram chat IDs
- the linked SillyTavern chat
