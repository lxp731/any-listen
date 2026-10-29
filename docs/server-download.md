# 服务端下载（阶段一：后端 + CLI）

在 any-listen 的 web-server 里新增的"服务端下载歌曲到本地目录"能力，产物可直接给 Navidrome 使用。
阶段一不包含前端 UI，通过 HTTP 接口 / CLI 触发；阶段二再接列表按钮与下载队列页。

## 能力

```
选择歌曲（服务端搜索） → 取音频直链 → 下载 → 实测真实格式/码率 → 改正确扩展名
                        → 写 .lrc（UTF-8 BOM） → 写 ID3 标签（标题/艺术家/专辑/歌词/封面）
```

## 使用

前提：已在扩展里安装
- `online-metadata`（提供 `musicSearch` / `musicLyric` / `musicPic`）
- `lx-api-source-loader`（提供 `musicUrl`，需要导入音源脚本）

```bash
# 搜索（按 source 顺序回退，默认 kw → tx → wy → kg → mg）
node scripts/lxdl.mjs search "富士山下" "陈奕迅" kw

# 下载（quality 可选 128k/192k/320k/flac/flac24bit/wav；savePath 需在 allowPublicDir 内）
node scripts/lxdl.mjs add "富士山下" "陈奕迅" kw 320k /music

# 查看任务
node scripts/lxdl.mjs tasks
```

环境变量：`LX_BASE`（默认 `http://127.0.0.1:9500`）、`LX_PWD`（登录密码，默认 `admin123`）。

鉴权复用既有登录口令机制：请求头 `m = sha256(password + s)`、`s = 随机盐`，与 `/api/ipc/ah` 一致。

## HTTP 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/download/search` | `{name, artist?, source?, limit?}` |
| POST | `/api/download/add` | `{name, artist?, source?, quality?, savePath?, musicInfo?}` |
| GET | `/api/download/tasks` | 任务列表 |
| POST | `/api/download/remove` | `{id}` 或 `{all:true}` |

## 设置项（`download.*`）

| 键 | 默认 | 说明 |
|---|---|---|
| `download.enable` | `true` | 功能开关 |
| `download.savePath` | `/music` | 落盘目录（必须位于 `allowPublicDir`） |
| `download.fileName` | `%name% - %singer%` | 文件名模板 |
| `download.quality` | `320k` | 请求音质 |
| `download.maxDownloadNum` | `3` | 并发数 |
| `download.isDownloadLrc` | `true` | 是否写 `.lrc` |
| `download.lrcFormat` | `utf8` | `utf8` / `gbk` |
| `download.isEmbedLyric` | `true` | 是否把歌词写入标签（USLT） |
| `download.isEmbedPic` | `true` | 是否把封面写入标签（APIC） |
| `download.skipExistFile` | `true` | 目标已存在时跳过 |
| `download.acceptFallbackQuality` | `true` | 接受音源回落音质（仅记录，不阻断） |

## 关键设计（都来自实测，别改回去）

1. **不相信音源的 `quality`**：实测请求 `flac`/`320k` 常回落成 mp3 128k，扩展却原样回显请求值。
   因此下载完成后用 `music-metadata` 实测 `container/codec/bitrate`，命名为 `.mp3`/`.flac`，
   并把 `qualityFallback` 标记在任务上。
2. **先下到 `.part` 再改名**：`music-metadata` 会参考文件扩展名，把 mp3 内容存成 `.flac` 会导致解析直接失败
   （`FourCC contains invalid characters`）。所以统一下载到 `.<name>.lxdl.part`，探测后再重命名。
3. **歌词双写**：`.lrc`（UTF-8 BOM）+ 内嵌 USLT。Navidrome 默认
   `LyricsPriority = .ttml,.yaml,.yml,.elrc,.lrc,.srt,.txt,embedded`，外挂 `.lrc` 优先于内嵌。
4. **默认不合并翻译/音译歌词**（`tlyric`/`rlyric` 关闭），避免出现繁体或双语混排。
5. **虚拟地址解析**：音源返回的是 `al-ps-host:/api/p_static/<sha>.mp3`，下载前从
   `proxyServerState.proxyMap` 取回上游真实地址与请求头，避免"自己代理自己"多一跳。
6. **顺手修复了上游的两个 latent bug**（下载表从未被使用过，所以一直没人发现）：
   - `dbService/modules/download/statements.ts` 里列名写成了 camelCase，而建表是 snake_case
     → 原样运行会报 `SqliteError: no such column: "isComplate"`。
   - `@any-listen/nodejs/download` 的 `createDownload({path})` 中 `path` 是**完整文件路径**（不是目录），
     且 `fileName` 参数没有被使用。

## 已知限制（阶段一）

- 只对 MP3 写内嵌标签；FLAC/WAV 不写内嵌标签，改为在目录里写 `cover.jpg` 兜底
  （实测音源基本只给 mp3，暂不引入 FLAC 元数据流式改写）。
- 暂停/续传未实现；进程重启后进行中的任务会重置为"等待"，不会自动续传。
- 任务表无用户维度（沿用桌面版单用户模型），多人共用时会看到同一份下载列表。
- 封面直接沿用上游图片（可能是 webp），未做统一转码。
- 前端 UI（列表右键下载、下载队列页、设置页）属于阶段二。

## 改动文件

新增：
```
packages/web-server/src/app/modules/download/
  index.ts    队列与任务生命周期、搜索、DB 持久化与恢复
  service.ts  单任务编排（取链→下载→探测→改名→歌词→标签）
  probe.ts    真实格式/码率探测
  meta.ts     ID3 写入与封面处理
  lyric.ts    .lrc 生成与编码
  url.ts      虚拟地址 → 上游直链
  http.ts     /api/download/* 路由与口令鉴权
  types.ts    模块内部类型
scripts/lxdl.mjs   阶段一 CLI
```

修改：
```
packages/web-server/src/app/modules/index.ts        注册 initDownload()
packages/web-server/src/modules/index.ts            注册下载路由
packages/web-server/src/app/shared/defaultSetting.ts 默认下载目录 /music
packages/shared/common/defaultSetting.ts             新增 9 个 download.* 键
packages/shared/types/types/app_setting.d.ts         对应类型
packages/shared/app/modules/worker/dbService/modules/download/statements.ts  修正列名 + 补充更新字段
packages/web-server/package.json                     新增 node-id3 / iconv-lite / music-metadata
```

## 阶段二（已实现）：前端整合

| 位置 | 说明 |
|---|---|
| 歌曲列表「操作」列 | 播放 + 下载两个图标（复用 `components/layout/Icons.svelte` 里 desktop 的 `#icon-testPlay` / `#icon-download`），点击即可下载，不再需要右键 |
| 右键菜单 | 保留「下载」项（支持多选后批量下载） |
| 下载弹窗 | `components/common/DownloadModal`，选音质后加入队列（默认取设置里的音质） |
| 下载页 `/download` | 任务列表：进度条、状态、实测码率、`码率回落` 标记、移除/清空（1.5s 轮询） |
| 设置页「下载」分组 | 开关、目录、默认音质、并发数、`.lrc`、编码、内嵌歌词、内嵌封面、跳过已存在、接受回落 |
| IPC | `downloadSearch / downloadAdd / downloadTasks / downloadRemove / downloadClear / downloadQualitys` |

注意：设置页的 `selection` 类型不会自动翻译 `enum.name`（上游行为），因此这些枚举项用 `i18n.t()` 预先翻译。

前端进度采用**轮询**（1.5s）而不是 websocket 推送：实现简单、无事件通道改动；任务数少（并发 ≤5）时开销可忽略。
