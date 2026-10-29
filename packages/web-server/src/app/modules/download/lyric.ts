import iconv from 'iconv-lite'

import { writeFile } from '@any-listen/nodejs'
import { buildLyrics } from '@any-listen/nodejs/lrcTool'

export interface LrcOptions {
  /** 歌词文件编码 */
  format?: 'utf8' | 'gbk'
  /** 是否合并 lx 逐行歌词 */
  isLx?: boolean
  /** 是否合并翻译歌词（默认关闭，避免出现繁体/双语混杂） */
  isT?: boolean
  /** 是否合并音译歌词 */
  isR?: boolean
}

/** 构建最终写入的歌词文本 */
export const buildLrcText = (info: AnyListen.Music.LyricInfo, options: LrcOptions = {}) => {
  if (!info.lyric?.trim()) return ''
  return buildLyrics(info, options.isLx ?? false, options.isT ?? false, options.isR ?? false).trim()
}

/** 写入 .lrc 文件（默认 utf-8 + BOM，兼容 Windows 播放器与 Navidrome） */
export const saveLrcFile = async (lrcPath: string, info: AnyListen.Music.LyricInfo, options: LrcOptions = {}) => {
  const text = buildLrcText(info, options)
  if (!text) return false
  const normalized = text.replace(/\r\n?/g, '\n')
  const buffer = iconv.encode(normalized, options.format == 'gbk' ? 'gbk' : 'utf8', { addBOM: true })
  await writeFile(lrcPath, buffer)
  return true
}
