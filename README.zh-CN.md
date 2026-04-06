# SillyTavern Telegram Bridge

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

适用于 SillyTavern 的 Telegram Bridge，按可分发形式打包为：

- 位于 `plugins/telegram-bridge` 的后端服务端插件
- 位于 `extensions/telegram-bridge` 的前端扩展

这个桥接支持：

- 将 Telegram Bot 接入 SillyTavern
- 在前端选择要绑定的 SillyTavern 聊天
- 在前端配置 `botToken` 和 Telegram `Chat ID`
- 让 Telegram 对话继续走所选的 SillyTavern 聊天上下文

## 包含内容

- `plugins/telegram-bridge`
  SillyTavern 在启用 `enableServerPlugins: true` 后加载的服务端插件。
- `extensions/telegram-bridge`
  显示在 SillyTavern 扩展面板中的前端扩展。
- `install.ps1`
  用于将这两部分安装到现有 SillyTavern 目录中的 Windows 安装脚本。

## 运行要求

- 已启用服务端插件的 SillyTavern
- 通过 `@BotFather` 创建的 Telegram Bot
- 已在 SillyTavern 中配置好的可用上游 chat-completions 提供方

## 快速开始

### Windows

运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -SillyTavernRoot "E:\Path\To\SillyTavern"
```

可选参数：

- `-UserHandle default-user`
- `-Force`

### 手动安装

1. 将 `plugins/telegram-bridge` 复制到 SillyTavern 的 `plugins` 目录。
2. 将 `extensions/telegram-bridge` 复制到 `data/<你的用户句柄>/extensions/telegram-bridge`。
3. 打开 SillyTavern 的 `config.yaml`，确认启用：

```yaml
enableServerPlugins: true
```

4. 重启 SillyTavern。
5. 打开扩展面板并启用 `Telegram Bridge`。

## 前端配置

安装完成后，在 SillyTavern 中打开 `Telegram Bridge` 设置抽屉，然后：

1. 启用桥接
2. 填入 Telegram `botToken`
3. 填入一个或多个 Telegram `Chat ID`
4. 选择要绑定的 SillyTavern 聊天
5. 保存

获取 Telegram Chat ID 的方式：

1. 给你的 Bot 发送 `/start`
2. 给你的 Bot 发送 `/whoami`
3. 复制返回消息中的 `Chat ID`

## 项目结构

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

## API 路由

服务端插件会挂载到：

`/api/plugins/telegram-bridge`

可用接口：

- `GET /status`
- `GET /config`
- `GET /chats`
- `POST /config`
- `POST /select-chat`
- `POST /reset`

## 故障排查

### 扩展没有出现在 SillyTavern 中

- 确认前端文件已复制到 `data/<user>/extensions/telegram-bridge`
- 在扩展管理器中确认该扩展没有被禁用
- 安装后刷新浏览器页面

### 插件 API 路由不存在

- 确认 `plugins/telegram-bridge` 已安装到 SillyTavern 根目录
- 确认 `config.yaml` 中已设置 `enableServerPlugins: true`
- 安装插件后重启 SillyTavern

### Telegram 返回 bridge 错误

- 确认 bot token 有效
- 确认 Telegram chat ID 已被授权
- 确认 SillyTavern 的上游模型连接正常
- 检查 `/api/plugins/telegram-bridge/status` 中的 `lastError`

## 开发说明

- 服务端插件适配 SillyTavern 的 server plugin loader。
- 前端扩展适配 SillyTavern 的用户级或全局 third-party extension 体系。
- 当前仓库还没有声明开源许可证；如果你希望更广泛分发，建议补充明确的许可证文件。

## 贡献

参见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 更新记录

参见 [CHANGELOG.md](./CHANGELOG.md)。
