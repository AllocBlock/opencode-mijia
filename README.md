# opencode-mijia

OpenCode 插件，在AI状态变化时联动米家设备（如修改灯光）。

## 安装

> **本项目不是开箱即用的。** 安装时使用你的 AI agent 帮你安装，根据你选择的设备和需求定制 `mijia-hook.js` 的代码。

安装步骤详见 [setup.md](docs/setup.md)，AI agent 可按照该文档协助完成安装配置。安装完成后重启 OpenCode 即可生效。

## 生命周期

| 事件 | 触发的函数 |
|------|-----------|
| 插件启动 | `on_start()` |
| AI 处理中（`session.status {busy}`） | `on_busy()` |
| AI 向用户提问（`question.asked`） | `on_question()` |
| AI 空闲（`session.status {idle}`） | `on_idle()` |
| 进程退出 | `on_exit()` |

## 文档

| 文档 | 说明 |
|------|------|
| [setup.md](docs/setup.md) | 安装指南 |
| [cli.md](docs/cli.md) | CLI 参考 |
