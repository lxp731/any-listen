// import { state } from './shared'

import { QUALITYS } from '@any-listen/common/constants'
import { VIRTUAL_PROTOCOL } from '@any-listen/common/tools'

import { resourceState } from './shared'

export const TRY_QUALITYS_LIST = ['flac24bit', 'flac', '320k'] as const
// type TryQualityType = (typeof TRY_QUALITYS_LIST)[number]
// export const getPlayQuality = (
//   playQuality: AnyListen.Music.Quality,
//   musicInfo: AnyListen.Music.MusicInfoOnline
// ): AnyListen.Music.Quality => {
//   let type: AnyListen.Music.Quality = '128k'
//   if (TRY_QUALITYS_LIST.includes(playQuality as TryQualityType)) {
//     let list = state.resources.musicUrl[musicInfo.source]

//     let t = TRY_QUALITYS_LIST.slice(TRY_QUALITYS_LIST.indexOf(playQuality as TryQualityType)).find(
//       (q) => musicInfo.meta._qualitys[q] && list?.includes(q)
//     )

//     if (t) type = t
//   }
//   return type
// }

/**
 * 根据歌曲真实可用的音质（`meta.qualitys`）挑选实际请求的音质。
 *
 * 规则（与桌面版 `getMusicType` 同源，但语义更保守）：
 * 1. 请求音质可用 → 原样使用
 * 2. 否则取「低于请求音质里最高的一档」
 * 3. 再否则取「高于请求音质里最低的一档」（避免整首下不了）
 * 4. `qualitys` 为空（本地曲目/老数据/扩展未提供）→ 原样返回，行为与没有该逻辑时一致
 */
export const pickQuality = (
  musicInfo: AnyListen.Music.MusicInfo,
  requested: string
): AnyListen.Music.Quality => {
  const requestedQuality = requested as AnyListen.Music.Quality
  if (musicInfo.isLocal) return requestedQuality
  const qualitys = musicInfo.meta.qualitys
  if (!qualitys || !Object.keys(qualitys).length) return requestedQuality
  if (qualitys[requestedQuality]) return requestedQuality

  const requestedIndex = QUALITYS.indexOf(requestedQuality)
  const available = QUALITYS.map((quality, index) => ({ quality, index })).filter(
    (item) => qualitys[item.quality]
  )
  if (!available.length) return requestedQuality

  const lower = available.filter((item) => requestedIndex < 0 || item.index < requestedIndex)
  if (lower.length) return lower[lower.length - 1].quality

  const higher = available.filter((item) => item.index > requestedIndex)
  if (higher.length) return higher[0].quality

  return requestedQuality
}

/** 取该歌曲可用的最高音质（批量下载「自动」档用） */
export const getHighestQuality = (musicInfo: AnyListen.Music.MusicInfo): AnyListen.Music.Quality => {
  const qualitys = musicInfo.isLocal ? null : musicInfo.meta.qualitys
  if (!qualitys || !Object.keys(qualitys).length) return '128k'
  for (let i = QUALITYS.length - 1; i > -1; i--) {
    const quality = QUALITYS[i]
    if (qualitys[quality]) return quality
  }
  return '128k'
}

export const buildExtSourceId = (source: string, extensionId: string) => `${extensionId}__${source}`

export const getSourceAllExtSourceIds = <T extends AnyListen.Extension.ResourceAction>(action: T, source: string) => {
  const list = resourceState.resources[action] ?? []
  return list.filter((r) => r.id == source).map((r) => buildExtSourceId(r.extensionId, r.id))
}

/**
 * @description 获取资源来源的扩展信息
 * @param action 资源行为，如 musicSearch、lyricSearch 等
 * @param exclude 排除的来源，格式为 extensionId__source
 * @param source 指定来源 source 字段
 * @returns 来源信息，包含 extensionId、source、name 等字段
 * @example
 * getExtSource('musicSearch', [], 'netease') // 获取 source 字段为 netease 的音乐搜索资源来源信息
 * getExtSource('lyricSearch', ['ext1__source1']) // 获取 lyricSearch 资源来源信息，排除 ext1__source1
 * getExtSource('musicSearch') // 获取任意一个 musicSearch 资源来源信息
 */
export const getExtSource = <T extends AnyListen.Extension.ResourceAction>(
  action: T,
  exclude: string[] = [],
  source?: string
) => {
  return (resourceState.resources[action] ?? []).find(
    (r) => (!source || r.id == source) && !exclude.includes(buildExtSourceId(r.extensionId, r.id))
  )
}

const httpRxp = /^(?:(?:https?|file):\/\/\S+|(?:\.{0,2})\/(?!\/)\S*)$/
const httpRxpWebServer = /^(?:https?:\/\/\S+|(?:\.{0,2})\/(?!\/)\S*)$/
const proxyUrlRxp = new RegExp(`^${VIRTUAL_PROTOCOL}`)
export const allowedUrl = (url: string) => {
  if (import.meta.env.VITE_IS_DESKTOP) return httpRxp.test(url) || proxyUrlRxp.test(url)
  return httpRxpWebServer.test(url) || proxyUrlRxp.test(url)
}
