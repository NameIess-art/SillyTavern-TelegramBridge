# Contributing

Thanks for contributing.

## Scope

This repository contains:

- the SillyTavern server plugin for Telegram bridging
- the SillyTavern front-end extension used to configure it
- release packaging files and installer scripts

## Development Workflow

1. Make focused changes.
2. Keep front-end and server-side documentation in sync.
3. Validate syntax before opening a PR.
4. Describe behavioral changes clearly in the PR.

## Validation

Recommended checks before submitting:

```powershell
node --check .\extensions\telegram-bridge\index.js
node --check .\plugins\telegram-bridge\index.mjs
powershell -NoProfile -ExecutionPolicy Bypass -Command "$errors = $null; [void][System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw '.\install.ps1'), [ref]$errors); if ($errors) { $errors | ForEach-Object { $_.ToString() } } else { 'OK' }"
```

## Pull Requests

- keep PRs small and intentional
- explain the user-visible impact
- include manual test notes when behavior changes
- update `CHANGELOG.md` when shipping a release-worthy change
