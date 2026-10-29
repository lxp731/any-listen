import { proxyServerState } from '@any-listen/app/modules/proxyServer'
import { buildRealPublicPath, VIRTUAL_PROTOCOL } from '@any-listen/common/tools'

export interface ResolvedSource {
  url: string
  headers: Record<string, string>
}

const getProxyName = (virtualUrl: string) => {
  const path = virtualUrl.slice(VIRTUAL_PROTOCOL.length)
  const name = path.split('/').filter((s) => s).pop()
  return name ?? ''
}

/**
 * 音源扩展返回的地址可能是 `al-ps-host:/api/p_static/<sha>.mp3` 这种虚拟地址，
 * 服务端下载时应尽量拿回上游原始地址与请求头，避免自己再代理自己一次。
 */
export const resolveDownloadSource = (url: string): ResolvedSource => {
  if (!url.startsWith(VIRTUAL_PROTOCOL)) {
    return { url, headers: {} }
  }

  const name = getProxyName(url)
  const info = proxyServerState.proxyMap.get(name)
  if (info) {
    const headers: Record<string, string> = {}
    const raw = info.requestOptions.headers
    if (raw) {
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v == 'string') headers[k] = v
        else if (Array.isArray(v)) headers[k] = v.join(', ')
      }
    }
    return { url: info.url, headers }
  }

  // 兜底：走本服务自己的代理路径
  const port = process.env.PORT ?? '9500'
  const host = process.env.PORT_HOST ?? `http://127.0.0.1:${port}`
  return { url: buildRealPublicPath(url, host), headers: {} }
}

export const isVirtualUrl = (url: string) => url.startsWith(VIRTUAL_PROTOCOL)
