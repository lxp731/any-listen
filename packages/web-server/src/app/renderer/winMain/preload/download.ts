import type { IPCSocket } from '@/preload/ws'

// 暴露给前端的方法
export const createClientDownload = (ipcSocket: IPCSocket) => {
  return {
    async downloadSearch(params) {
      return ipcSocket.remote.downloadSearch(params)
    },
    async downloadAdd(params) {
      return ipcSocket.remote.downloadAdd(params)
    },
    async downloadTasks() {
      return ipcSocket.remote.downloadTasks()
    },
    async downloadRemove(ids) {
      return ipcSocket.remote.downloadRemove(ids)
    },
    async downloadClear() {
      return ipcSocket.remote.downloadClear()
    },
    async downloadQualitys() {
      return ipcSocket.remote.downloadQualitys()
    },
  } satisfies Partial<AnyListen.IPC.ServerIPC>
}
