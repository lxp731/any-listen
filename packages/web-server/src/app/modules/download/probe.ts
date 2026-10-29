import { getFileStats } from '@any-listen/nodejs'

import type { ProbeResult } from './types'

/**
 * 读取音频文件的真实格式信息。
 * 音源扩展返回的 quality 字段不可信（实测请求 flac/320k 常回落 mp3 128k），
 * 所以下载完成后必须以实测码率为准。
 */
export const probeAudioFile = async (filePath: string, silent = false): Promise<ProbeResult | null> => {
  try {
    // 与 @any-listen/nodejs 保持一致，使用动态导入（music-metadata 为 ESM 包）
    const { parseFile } = await import('music-metadata')
    const meta = await parseFile(filePath, { duration: true, skipCovers: true })
    const stats = await getFileStats(filePath)
    return {
      container: meta.format.container ?? '',
      codec: meta.format.codec ?? '',
      bitrate: meta.format.bitrate ? Math.round(meta.format.bitrate / 1000) : 0,
      sampleRate: meta.format.sampleRate ?? 0,
      lossless: !!meta.format.lossless,
      duration: meta.format.duration ?? 0,
      size: stats?.size ?? 0,
    }
  } catch (err) {
    if (!silent) console.log('[download] probe failed:', filePath, (err as Error).message)
    return null
  }
}
