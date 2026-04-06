# Changelog

All notable changes to this project should be documented in this file.

## Unreleased

- Added Telegram pseudo-streaming output by progressively editing bot messages during upstream streaming responses
- Added basic Telegram HTML rendering for emphasis, inline code, and code blocks
- Added dialogue-style Telegram layout for quoted speech paragraphs, with automatic fallback to plain text if formatting fails
- Improved roleplay-style layout by detecting full action paragraphs and rendering them separately from quoted dialogue
- Increased dialogue emphasis and converted full action paragraphs into aside-style stage-note blocks

## 0.1.0 - 2026-04-06

- Initial public package layout for the SillyTavern Telegram Bridge
- Added bundled server plugin under `plugins/telegram-bridge`
- Added bundled front-end extension under `extensions/telegram-bridge`
- Added Windows installer script `install.ps1`
- Added setup and troubleshooting documentation
