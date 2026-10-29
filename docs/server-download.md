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

## 前端容易踩的坑（补充）

- **`t` 是 Svelte store，不是函数**：`import { t } from '@/plugins/i18n'` 之后只能在 `.svelte` 模板/`<script>` 里用 `$t(...)`；
  在纯 `.ts` 文件里必须 `import { i18n }` 然后 `i18n.t(...)`。
  写成 `t('key')` 会抛 `t is not a function`（生产构建压缩后显示为 `G is not a function`）。
  `.svelte` 文件里两种都要导入：`import { i18n, t } from '@/plugins/i18n'`（`t` 供 `$t` 用，`i18n` 供脚本里用），
  漏了 `t` 会构建报 `` `$t` is an illegal variable name ``。

## 音质选择：按 `meta.qualitys` 逐首降级（对齐桌面版思路）

### 数据来源

搜索/详情接口返回的每条歌自带 `meta.qualitys`（`{ flac: { sizeStr }, '320k': { sizeStr }, ... }`），
**不需要额外请求**。桌面版用的是 `_qualitys` 布尔表 + `qualityList[source]`；网页版统一用 `qualitys`，
"源是否支持某音质"由扩展清单（谁声明 `musicUrl`）决定。

### 选择规则（`shared/app/modules/resources/utils.ts` → `pickQuality`）

1. 本曲有请求的档 → 用它
2. 否则取「低于请求档里最高的一档」
3. 再否则取「高于请求档里最低的一档」
4. `qualitys` 为空（本地曲目/老数据/扩展未提供）→ 原样返回，行为与没有该逻辑时一致

任务里区分三个值：`requestedQuality`（用户选的）/ `effectiveQuality`（按本曲降级后实际请求的）/ `actualQuality`（下载后实测的）。
`quality='auto'` 表示按每首可用最高（批量下载用，见 `getHighestQuality`）。

### 前端

- 单曲弹窗：只列本曲可用档位，显示 `档位名 + 文件大小`（`无损 FLAC 26.62MB` / `高品质 320K 9.89MB` / `普通 128K 3.96MB`）
- 多选弹窗：顶部「自动（每首可用最高）」，其余档位显示 `n/m 首支持`，全不支持置灰
- `qualitys` 缺失 → 退回全量档位并提示

### 实测（重要）

`qualitys` 是"平台宣称"，不等于音源脚本能拿到：

```
江南/kg : qualitys = 128k/320k/flac/flac24bit；请求 flac24bit → 降级后请求 flac → 实测 mp3 128k（回落）
茉莉雨/wy: qualitys = flac/320k/128k；请求 flac24bit → 降级 flac → 实测 128k（回落）
富士山下/kw: 请求 320k → 实测真 320k
```

所以仍**保留实测码率 + `码率回落` 标记**，并在下载过程中提前探测（越过 1.5/3/6MB 时静默探一次），
大文件不必等整首下完就能看到实际码率。

### 顺带修掉的一个真 bug

下载取链改为**一律 `isRefresh: true`**：`music_url` 表里的缓存没有时间戳，
复用播放缓存中的旧链接会稳定 404，之前每首歌都白跑一次失败请求
（服务端日志 `first attempt failed: request failed: 404 Not Found`）。

### 播放链路同步修正

`web-server/src/app/modules/music/online.ts` 的 `getMusicUrl` / `getMusicUrlByExtSource` 也套用 `pickQuality`：
设置里选 flac、而本曲只有 320k 时，不再硬请求 flac 被音源静默回落（独立提交，可单独回退）。

## 多架构镜像（arm64 / arm）

上游 `Dockerfile` 是**单架构**构建（在容器里编译 better-sqlite3），在 x86 上直接 build 出来的镜像
`Architecture=amd64`，拿到 ARM 机器上会报 exec format / 原生模块加载失败。

本仓库额外提供**交叉装配**方式（`Dockerfile.cross` + `scripts/build-multiarch.sh`）：

```bash
# 构建 amd64 + arm64（JS 只在宿主构建一次，无需 QEMU 跑构建）
./scripts/build-multiarch.sh amd64 arm64
# 只出 arm64，并导出 tar 便于拷到 ARM 机器
SAVE_DIR=./dist-images ./scripts/build-multiarch.sh arm64
```

要点：

1. `build/`（JS 与前端静态文件）与架构无关，只有 `build/native/<platform>_<arch>_v11/better_sqlite3.node` 和架构相关。
2. 各架构的原生库直接用上游 release：
   `any-listen/any-listen-web-server-native-lib` 的 `linux_{x64,arm64,arm}_v11.tar.gz`。
3. **这些原生库是 glibc 构建**（`NEEDED: libc.so.6 / GLIBC_2.28`），所以交叉镜像基座用
   `node:24-bookworm-slim`（glibc），放进 alpine(musl) 会报
   `Error relocating .../better_sqlite3.node: fcntl64: symbol not found`。
   官方 alpine 镜像能用，是因为它在 alpine 内自己编译了 musl 版 .node。
4. 镜像内目录必须是 `native/linux_<process.arch>_v11`（运行时按 `getNativeName()` 查找），
   注意 x64 的资产名是 `x64` 而不是 `amd64`。
5. uid/gid 仍是 1001，和 `userns_mode: keep-id:uid=1001,gid=1001` 兼容。

ARM 机器上使用：

```bash
# 拷过去
scp any-listen-arm64.tar.zst arm-host:/tmp/
ssh arm-host 'zstd -d -f /tmp/any-listen-arm64.tar.zst -o /tmp/any-listen.tar && podman load -i /tmp/any-listen.tar'
# 想保持 compose 里的 tag 不变的话
ssh arm-host 'podman tag localhost/any-listen-web-server:download-ui-arm64 localhost/any-listen-web-server:download-ui'
```
