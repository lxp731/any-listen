import { DOWNLOAD_STATUS } from '@any-listen/common/constants'

export type DownloadTaskStatus = (typeof DOWNLOAD_STATUS)[keyof typeof DOWNLOAD_STATUS]

export interface DownloadProgress {
  progress: number
  speed: string
  downloaded: number
  total: number
  writeQueue: number
}

export interface ProbeResult {
  container: string
  codec: string
  bitrate: number
  sampleRate: number
  lossless: boolean
  duration: number
  size: number
}

export interface DownloadTask {
  id: string
  musicInfo: AnyListen.Music.MusicInfoOnline
  /** 用户请求的音质（可能是 auto） */
  requestedQuality: string
  /** 按本曲可用音质降级后，真正去请求的音质 */
  effectiveQuality: string
  /** 音源实际给出的音质 */
  actualQuality: string
  /** 实测码率（kbps） */
  actualBitrate: number
  /** 请求音质与实际码率不匹配 */
  qualityFallback: boolean
  status: DownloadTaskStatus
  statusText: string
  progress: DownloadProgress
  ext: AnyListen.Download.FileExt
  /** 落盘目录 */
  savePath: string
  fileName: string
  filePath: string
  lrcPath: string
  error: string
  createdAt: number
  updatedAt: number
}

export interface DownloadOptions {
  /** 目标目录，缺省取 setting download.savePath */
  savePath?: string
  /** 请求音质，缺省取 setting download.quality */
  quality?: string
  /** 文件名模板，缺省取 setting download.fileName */
  fileName?: string
}

export interface SearchMusicParams {
  name: string
  artist?: string
  albumName?: string
  /** 指定音源来源（kw/tx/wy/kg/mg），缺省按 setting 里可用的逐个尝试 */
  source?: string
  limit?: number
  /** 指定扩展 id，缺省自动查找提供 musicSearch 的扩展 */
  extensionId?: string
}
