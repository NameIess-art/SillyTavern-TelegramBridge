# Changelog

All notable changes to this project should be documented in this file.

## Unreleased

- Simplified configuration back to a single authorized Telegram `Chat ID`
- Removed per-Telegram-chat SillyTavern chat mappings from the front-end and runtime config
- Kept `/chats` and `/bind <number>` for switching the currently linked SillyTavern chat within the authorized Telegram session
- Added Telegram pseudo-streaming output by progressively editing bot messages during upstream streaming responses
- Added basic Telegram HTML rendering for emphasis, inline code, and code blocks
- Added dialogue-style Telegram layout for quoted speech paragraphs, with automatic fallback to plain text if formatting fails
- Improved roleplay-style layout by detecting full action paragraphs and rendering them separately from quoted dialogue
- Added Telegram bot commands for listing chats and switching the current Telegram chat binding without using the front end

## 0.1.0 - 2026-04-06

- Initial public package layout for the SillyTavern Telegram Bridge
- Added bundled server plugin under `plugins/telegram-bridge`
- Added bundled front-end extension under `extensions/telegram-bridge`
- Added Windows installer script `install.ps1`
- Added setup and troubleshooting documentation
