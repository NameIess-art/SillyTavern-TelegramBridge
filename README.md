# SillyTavern Telegram Bridge

This package contains both parts required for the Telegram Bridge:

- A SillyTavern server plugin
- A SillyTavern front-end extension

## Package Layout

- `plugins/telegram-bridge`
  Server plugin. Copy this into your SillyTavern `plugins` folder.
- `extensions/telegram-bridge`
  Front-end extension. Copy this into `data/<your-user-handle>/extensions/telegram-bridge`.
- `install.ps1`
  Optional Windows installer script that copies both parts into an existing SillyTavern install.

## Manual Install

1. Copy `plugins/telegram-bridge` into your SillyTavern `plugins` folder.
2. Copy `extensions/telegram-bridge` into your SillyTavern user extensions folder.
   Example for the default user:
   `data/default-user/extensions/telegram-bridge`
3. In `config.yaml`, make sure:
   `enableServerPlugins: true`
4. Restart SillyTavern.
5. Open the SillyTavern Extensions panel and enable `Telegram Bridge`.
6. In the front-end settings drawer:
   - enter your `botToken`
   - enter your Telegram `Chat ID`
   - choose which SillyTavern chat should be linked
   - save

## Windows Install Script

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -SillyTavernRoot "E:\Path\To\SillyTavern"
```

Optional parameters:

- `-UserHandle default-user`
- `-Force`

## Notes

- The server plugin API routes are mounted under:
  `/api/plugins/telegram-bridge`
- The extension expects the server plugin to be installed and server plugins to be enabled.
- If you use a non-default SillyTavern user, install the front-end extension into that user's `extensions` directory.
