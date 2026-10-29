import fs from 'node:fs/promises'

import { getFileType } from '@any-listen/common/tools'
import { DOWNLOAD_STATUS } from '@any-listen/common/constants'
import { checkAndCreateDir, checkFile, getFileStats, joinPath, removeFileIgnoreError, renamePath } from '@any-listen/nodejs'
import { createDownload } from '@any-listen/nodejs/download'

import { appState } from '@/app/app'
import { checkAllowPathError } from '@/app/modules/fileSystem'
import { getLyricInfo, getMusicPic, getMusicUrl } from '@/app/modules/music'

import { saveLrcFile } from './lyric'
import { enhancePicUrl, guessImageMime, writeMp3Tag, type CoverImage } from './meta'
import { probeAudioFile } from './probe'
import type { DownloadTask, ProbeResult } from './types'
import { resolveDownloadSource } from './url'

const INVALID_CHAR_RXP = /[/\\:*?"<>|]/g

/** 请求音质与实测结果是否不符 */
export const isQualityFallback = (requestedQuality: string, probe: ProbeResult) => {
  if (requestedQuality == 'flac' || requestedQuality == 'flac24bit') return !probe.lossless
  if (requestedQuality == 'wav') return !probe.lossless && !/wave/i.test(probe.container)
  const expectMin: Record<string, number> = { '128k': 100, '192k': 160, '320k': 256 }
  const min = expectMin[requestedQuality] ?? 0
  return min > 0 && probe.bitrate > 0 && probe.bitrate < min
}

/** 从实测元数据推断扩展名 */
export const detectExt = (probe: ProbeResult): AnyListen.Download.FileExt | null => {
  const text = `${probe.container} ${probe.codec}`.toLowerCase()
  if (/flac/.test(text) || probe.lossless) return 'flac'
  if (/wave|pcm/.test(text)) return 'wav'
  if (/mpeg|mp3|layer 3/.test(text)) return 'mp3'
  return null
}

export const filterFileName = (name: string) => name.replace(INVALID_CHAR_RXP, '_').replace(/^\.+/, '').trim()

export const formatMusicName = (template: string, name: string, singer?: string | null) =>
  template.replace(/%name%/g, name).replace(/%singer%/g, singer ?? '')

const buildExt = (quality: string): AnyListen.Download.FileExt => {
  const type = getFileType(quality)
  return type == 'flac' ? 'flac' : type == 'wav' ? 'wav' : 'mp3'
}

const downloadFile = (
  source: { url: string; headers: Record<string, string> },
  tempPath: string,
  useProxy: { host: string; port: string } | null,
  onProgress: (progress: AnyListen.Download.ProgressInfo) => void
) =>
  new Promise<void>((resolve, reject) => {
    createDownload({
      url: source.url,
      // 注意：any-listen 版 createDownload 的 path 是「完整文件路径」（不是目录）
      path: tempPath,
      headers: source.headers,
      proxy: useProxy ?? undefined,
      onProgress,
      onCompleted() {
        resolve()
      },
      onError(err) {
        reject(err)
      },
      onFail(response) {
        reject(new Error(`request failed: ${response.statusCode ?? ''} ${response.statusMessage ?? ''}`.trim()))
      },
      onStop() {
        reject(new Error('download stopped'))
      },
    })
  })

const fetchCover = async (musicInfo: AnyListen.Music.MusicInfoOnline): Promise<CoverImage | null> => {
  let url = musicInfo.meta.picUrl ?? ''
  if (!url) {
    try {
      const info = await getMusicPic({ musicInfo })
      url = info.url ?? ''
    } catch {
      return null
    }
  }
  if (!url) return null
  const source = resolveDownloadSource(enhancePicUrl(url))
  try {
    const resp = await fetch(source.url, { headers: source.headers, signal: AbortSignal.timeout(20_000) })
    if (!resp.ok) return null
    const buffer = Buffer.from(await resp.arrayBuffer())
    if (!buffer.length) return null
    return { mime: guessImageMime(buffer), buffer }
  } catch {
    return null
  }
}

/**
 * 执行单个下载任务：取链 → 下载 → 实测码率 → 标签/歌词/封面
 */
export const runDownloadTask = async (
  task: DownloadTask,
  savePath: string,
  quality: string,
  onProgress: (progress: AnyListen.Download.ProgressInfo) => void,
  onStatusText: (text: string) => void
) => {
  const setting = appState.appSetting

  if (!savePath) throw new Error('download.savePath is empty')
  const pathError = checkAllowPathError(savePath)
  if (pathError) throw new Error(`save path not allowed: ${savePath}`)

  await checkAndCreateDir(savePath)

  const requestExt = buildExt(quality)
  const baseName = filterFileName(
    formatMusicName(setting['download.fileName'], task.musicInfo.name, task.musicInfo.singer)
  )
  task.requestedQuality = quality
  task.lrcPath = joinPath(savePath, `${baseName}.lrc`)

  // 先落到 .part 临时文件，等实测格式后再改成正确扩展名
  const tempPath = joinPath(savePath, `.${baseName}.lxdl.part`)

  if (setting['download.skipExistFile']) {
    for (const e of ['mp3', 'flac', 'wav', 'm4a'] as const) {
      const existPath = joinPath(savePath, `${baseName}.${e}`)
      const stats = await getFileStats(existPath)
      if (stats && stats.size > 1024) {
        task.ext = e
        task.fileName = `${baseName}.${e}`
        task.filePath = existPath
        task.status = DOWNLOAD_STATUS.COMPLETED
        task.statusText = '已存在，跳过下载'
        onStatusText(task.statusText)
        return
      }
    }
  }
  await removeFileIgnoreError(tempPath)

  // 取链
  onStatusText('获取歌曲链接...')
  let urlInfo: AnyListen.IPCMusic.MusicUrlInfo
  try {
    urlInfo = await getMusicUrl({ musicInfo: task.musicInfo, quality, isRefresh: false })
  } catch (err) {
    urlInfo = await getMusicUrl({ musicInfo: task.musicInfo, quality, isRefresh: true })
  }
  if (!urlInfo.url) throw new Error('get music url failed')
  task.actualQuality = urlInfo.quality || quality

  const useProxy =
    appState.proxy.host && appState.proxy.port ? { host: appState.proxy.host, port: appState.proxy.port } : null

  // 下载（链接失效时刷新一次重试）
  onStatusText('下载中...')
  let source = resolveDownloadSource(urlInfo.url)
  try {
    await downloadFile(source, tempPath, useProxy, onProgress)
  } catch (err) {
    const message = (err as Error).message ?? ''
    if (/request failed|ENOTFOUND|ECONNRESET|socket hang up|403|410|401/i.test(message)) {
      onStatusText('链接失效，刷新重试...')
      const refreshed = await getMusicUrl({ musicInfo: task.musicInfo, quality, isRefresh: true })
      task.actualQuality = refreshed.quality || quality
      source = resolveDownloadSource(refreshed.url)
      await downloadFile(source, tempPath, useProxy, onProgress)
    } else {
      throw err
    }
  }

  // 实测真实格式与码率（不能相信音源返回的 quality）
  onStatusText('校验音频信息...')
  const probe = await probeAudioFile(tempPath)
  let finalExt = requestExt
  if (probe) {
    task.actualBitrate = probe.bitrate
    task.actualQuality = `${probe.codec || probe.container} ${probe.bitrate}k`.trim()
    task.qualityFallback = isQualityFallback(quality, probe)
    finalExt = detectExt(probe) ?? requestExt
  } else {
    task.actualQuality = urlInfo.quality || quality
  }

  // 按实测格式落最终文件名，避免出现「后缀 flac 内容是 mp3」
  task.ext = finalExt
  task.fileName = `${baseName}.${finalExt}`
  task.filePath = joinPath(savePath, task.fileName)
  await removeFileIgnoreError(task.filePath)
  await renamePath(tempPath, task.filePath)

  // 歌词
  let lyricText = ''
  if (setting['download.isDownloadLrc'] || setting['download.isEmbedLyric']) {
    onStatusText('获取歌词...')
    try {
      const lyricInfo = await getLyricInfo({ musicInfo: task.musicInfo })
      lyricText = lyricInfo.info?.lyric ?? ''
      if (setting['download.isDownloadLrc']) {
        await saveLrcFile(task.lrcPath, lyricInfo.info, {
          format: setting['download.lrcFormat'],
          isT: false,
          isR: false,
          isLx: false,
        })
      }
    } catch (err) {
      console.log('get lyric failed:', (err as Error).message)
    }
  }

  // 标签 / 封面
  onStatusText('写入标签...')
  const cover = setting['download.isEmbedPic'] ? await fetchCover(task.musicInfo) : null
  if (task.ext == 'mp3') {
    writeMp3Tag(task.filePath, {
      title: task.musicInfo.name,
      artist: task.musicInfo.singer ?? '',
      album: task.musicInfo.meta.albumName,
      lyric: setting['download.isEmbedLyric'] ? lyricText : '',
      cover: cover ?? undefined,
    })
  } else if (cover) {
    // flac/wav 阶段一不做内嵌，写同目录 cover.jpg 供 Navidrome 使用
    await fs.writeFile(`${savePath}/cover.jpg`, cover.buffer).catch(() => {})
  }

  task.status = DOWNLOAD_STATUS.COMPLETED
  task.statusText = '下载完成'
  onStatusText(task.statusText)

  if (!(await checkFile(task.filePath))) throw new Error('downloaded file missing')
}
