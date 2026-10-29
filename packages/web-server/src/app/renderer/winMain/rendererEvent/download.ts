import { QUALITYS } from '@any-listen/common/constants'

import {
  addDownloadTasks,
  clearDownloadTasks,
  getDownloadTasks,
  removeDownloadTask,
  searchMusic,
} from '@/app/modules/download'
import type { DownloadTask } from '@/app/modules/download/types'

import type { ExposeClientFunctions } from '.'

const toTaskInfo = (task: DownloadTask): AnyListen.IPCDownload.TaskInfo => ({
  id: task.id,
  musicInfo: task.musicInfo,
  requestedQuality: task.requestedQuality,
  effectiveQuality: task.effectiveQuality,
  actualQuality: task.actualQuality,
  actualBitrate: task.actualBitrate,
  qualityFallback: task.qualityFallback,
  status: task.status,
  statusText: task.statusText,
  progress: task.progress,
  ext: task.ext,
  fileName: task.fileName,
  filePath: task.filePath,
  error: task.error,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
})

// 暴露给前端的方法
export const createExposeDownload = () => {
  return {
    async downloadSearch(event, params) {
      return searchMusic(params)
    },
    async downloadAdd(event, params) {
      const tasks = await addDownloadTasks(params.musicInfos, {
        quality: params.quality,
        savePath: params.savePath,
      })
      return tasks.map(toTaskInfo)
    },
    async downloadTasks() {
      return getDownloadTasks().map(toTaskInfo)
    },
    async downloadRemove(event, ids) {
      for (const id of ids) await removeDownloadTask(id)
    },
    async downloadClear() {
      await clearDownloadTasks()
    },
    async downloadQualitys() {
      return [...QUALITYS]
    },
  } satisfies Partial<ExposeClientFunctions>
}
