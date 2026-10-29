import { ipc } from './ipc'

export const downloadSearch: AnyListen.IPC.ServerIPC['downloadSearch'] = async (params) => {
  return ipc.downloadSearch(params)
}

export const downloadAdd: AnyListen.IPC.ServerIPC['downloadAdd'] = async (params) => {
  return ipc.downloadAdd(params)
}

export const downloadTasks: AnyListen.IPC.ServerIPC['downloadTasks'] = async () => {
  return ipc.downloadTasks()
}

export const downloadRemove: AnyListen.IPC.ServerIPC['downloadRemove'] = async (ids) => {
  return ipc.downloadRemove(ids)
}

export const downloadClear: AnyListen.IPC.ServerIPC['downloadClear'] = async () => {
  return ipc.downloadClear()
}

export const downloadQualitys: AnyListen.IPC.ServerIPC['downloadQualitys'] = async () => {
  return ipc.downloadQualitys()
}
