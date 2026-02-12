# Discord 受保护附件 Bot

功能目标：在社区内对附件设置下载门槛（反应/评论/提取码/声明），并通过按钮面板领取作品。

## 已实现功能

- `长按消息 -> Apps -> 发布此消息附件作为作品`：从消息附件导入并打开交互面板（推荐）
- 发布后自动在原帖发送“作品发布处”新消息，并尝试删除原始附件消息
- 作品下载限制模式（当前支持）：
  - `无限制`
  - `点赞`
  - `点赞或回复`（满足其一）
- 提取码支持：
  - 可单独启用
  - 可与上方模式组合（例如：无限制 + 提取码 = 纯提取码）
  - 支持按钮弹窗输入提取码（会自动去掉首尾空格）
- 下载按钮面板：
  - `点击下载`
  - `输入提取码`（启用提取码时显示）
- 用户领取成功后，机器人会在私信发送 Components V2 下载卡片（含“点击下载”按钮与附件信息）
- 可选：发布时自动把附件转存到机器人所在服务器，并改为自有下载链接
- 每日下载额度控制：
  - 全局每日额度（默认 10，可通过环境变量配置）
  - 单作品策略：`开放分享` / `每日限定`
- 作者声明：
  - 可在发布时配置声明文本
  - 用户下载前需二次确认声明
- `/top`：在线程/帖子中发送“回到首楼”跳转按钮
- `/claim-by-id`：通过作品ID直接领取附件
- `/delete-post`：通过帖子链接删除整帖（仅帖子作者或管理方可用）
- 用户成功获取附件后，Bot 会自动把“用户ID + 作品ID + 文件名 + 时间”发送到私密溯源频道
- SQLite 持久化：附件规则、用户解锁状态、每日下载计数可重启恢复

## 使用前提

- Node.js >= 20
- Discord Bot 开启权限：
  - Send Messages
  - Read Message History
  - Add Reactions
  - Attach Files
  - Use Slash Commands
  - Send Messages in Threads

## 安装与启动

> 无需开启 Message Content Intent（已不请求该特权意图）。


```bash
npm install
cp .env.example .env
# 编辑 .env 填入 token/client id 等
npm run register
npm start
```

> 建议先配置 `DISCORD_GUILD_ID` 在测试服注册命令，确认稳定后再做全局注册。
> 如果你切换了 Node 版本，`npm start`/`pnpm start` 会自动检测并重建 `better-sqlite3` 二进制。
> 如果你本地无法直连 Discord（常见为 `ConnectTimeoutError`），请设置 `DISCORD_PROXY_URL`（如 `http://127.0.0.1:7897`）。

## 环境变量

- `DISCORD_TOKEN`：机器人 Token
- `DISCORD_CLIENT_ID`：应用 ID（可选；留空时注册命令会自动从 Token 解析）
- `DISCORD_GUILD_ID`：测试服务器 ID（可选）
- `DISCORD_PROXY_URL`：Discord 网络代理（可选，优先级高于 `HTTPS_PROXY`）
- `DB_PATH`：数据库路径（默认 `./data/bot.db`）
- `PASSWORD_SALT`：提取码哈希盐
- `DAILY_DOWNLOAD_LIMIT`：每日下载额度上限（默认 10）
- `FEEDBACK_CHANNEL_ID`：可选，填写后“获取作品”提示中的反馈频道将自动@该频道
- `TRACE_CHANNEL_ID`：可选，填写后会把每次成功领取记录发送到该私密频道
- `FILE_BASE_URL`：可选，填写后启用“附件转存到服务器并用自有链接下载”（例如 `https://files.example.com`）
- `FILE_STORAGE_DIR`：可选，转存文件目录（默认 `./data/uploads`）
- `FILE_SERVER_HOST`：可选，内置下载服务监听地址（默认 `0.0.0.0`）
- `FILE_SERVER_PORT`：可选，内置下载服务端口（默认 `8787`）

## 命令说明

### 0) 推荐：消息右键/长按发起面板（无指令）

在 Discord 对目标消息执行：

```text
Apps -> 发布此消息附件作为作品
```

会弹出“作品发布面板”，后续通过按钮完成模式切换、提取码、声明与发布。

### 1) 通过作品ID领取

```text
/claim-by-id asset_id:<作品ID>
```

### 2) 删除整个帖子

```text
/delete-post post_link:<帖子链接>
```

### 3) 回顶

```text
/top
```

返回一个可点击的“回到首楼”按钮（不再输出纯文本链接）。

### 4) 私密溯源（无命令）

配置 `TRACE_CHANNEL_ID` 后，用户每次成功获取附件，机器人会自动推送记录到该频道。

## 数据库

主要表：
- `protected_assets`：作品规则、附件快照、提取码/声明/额度策略
- `unlock_progress`：用户条件达成状态、声明确认状态、是否已私信
- `daily_usage`：用户每日下载计数

## 注意事项

- 若启用 `FILE_BASE_URL`，新发布作品会先转存到服务器本地，再下发你自己的下载链接；历史作品不会自动迁移。
- 生产环境建议把 `FILE_SERVER_PORT` 反向代理到你配置的 `FILE_BASE_URL`，并开启 HTTPS。
- 若用户关闭私信或屏蔽 Bot，自动发件会失败；可在允许私信后重试下载或使用 `/claim-by-id`。
- `点赞或回复` 中的“回复”依赖帖子/线程场景；在普通频道建议优先使用点赞模式。
# erciyuan
