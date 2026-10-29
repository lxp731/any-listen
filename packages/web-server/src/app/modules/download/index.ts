import { DOWNLOAD_STATUS } from '@any-listen/common/constants'
import { dirname } from '@any-listen/nodejs'
import { musicSearch } from '@any-listen/app/modules/resources'
import { getExtSource } from '@any-listen/app/modules/resources/utils'

import { appState } from '@/app/app'
import { workers } from '@/app/worker'

import { runDownloadTask } from './service'
import type { DownloadOptions, DownloadTask, SearchMusicParams } from './types'

const DEFAULT_SOURCES = ['kw', 'tx', 'wy', 'kg', 'mg']

/** 任务表（阶段一：内存队列 + download_list 表持久化） */
const tasks = new Map<string, DownloadTask>()
const activeTasks = new Set<string>()

const now = () => Date.now()

const toListItem = (task: DownloadTask): AnyListen.Download.ListItem => ({
  id: task.id,
  isComplate: task.status == DOWNLOAD_STATUS.COMPLETED,
  status: task.status,
  statusText: task.statusText,
  downloaded: task.progress.downloaded,
  total: task.progress.total,
  writeQueue: task.progress.writeQueue,
  progress: task.progress.progress,
  speed: task.progress.speed,
  metadata: {
    musicInfo: task.musicInfo,
    url: null,
    quality: task.requestedQuality,
    ext: task.ext,
    fileName: task.fileName,
    filePath: task.filePath,
  },
})

const persist = (task: DownloadTask, isNew = false) => {
  try {
    if (isNew) workers.dbService.downloadInfoSave([toListItem(task)], 'bottom')
    else workers.dbService.downloadInfoUpdate([toListItem(task)])
  } catch (err) {
    console.log('persist download task failed:', (err as Error).message)
  }
}

const execute = async (task: DownloadTask) => {
  const setting = appState.appSetting
  task.status = DOWNLOAD_STATUS.RUN
  task.statusText = '开始下载'
  task.updatedAt = now()
  persist(task)

  const onStatusText = (text: string) => {
    task.statusText = text
    task.updatedAt = now()
  }
  const onProgress = (progress: AnyListen.Download.ProgressInfo) => {
    task.progress = progress
    task.updatedAt = now()
  }

  try {
    await runDownloadTask(task, task.savePath, task.requestedQuality, onProgress, onStatusText)
    console.log(`[download] done: ${task.fileName} (${task.actualQuality || task.requestedQuality})`)
  } catch (err) {
    task.status = DOWNLOAD_STATUS.ERROR
    task.error = (err as Error).message ?? String(err)
    task.statusText = `下载失败: ${task.error}`
    console.log(`[download] failed: ${task.musicInfo.name} - ${task.musicInfo.singer}: ${task.error}`)
  }
  task.updatedAt = now()
  persist(task)
}

const schedule = () => {
  const max = Number(appState.appSetting['download.maxDownloadNum']) || 3
  for (const task of tasks.values()) {
    if (activeTasks.size >= max) return
    if (task.status != DOWNLOAD_STATUS.WAITING || activeTasks.has(task.id)) continue
    activeTasks.add(task.id)
    void execute(task).finally(() => {
      activeTasks.delete(task.id)
      schedule()
    })
  }
}

export const getDownloadTasks = (): DownloadTask[] => [...tasks.values()]

export const getDownloadTask = (id: string) => tasks.get(id) ?? null

export const searchMusic = async (params: SearchMusicParams) => {
  if (!params.name?.trim()) return { source: '', extensionId: '', list: [] }
  const sources = params.source ? [params.source] : DEFAULT_SOURCES
  const errors: string[] = []
  for (const source of sources) {
    const ext = params.extensionId
      ? { extensionId: params.extensionId, id: source }
      : getExtSource('musicSearch', [], source)
    if (!ext) {
      errors.push(`${source}: no extension`)
      continue
    }
    try {
      const result = await musicSearch({
        extensionId: ext.extensionId,
        source: ext.id,
        name: params.name,
        artist: params.artist,
        page: 1,
        limit: params.limit ?? 10,
      })
      if (result.list.length) {
        return { source, extensionId: ext.extensionId, list: result.list }
      }
      errors.push(`${source}: empty`)
    } catch (err) {
      errors.push(`${source}: ${(err as Error).message}`)
    }
  }
  console.log('[download] search failed:', errors.join(' | '))
  return { source: '', extensionId: '', list: [] }
}

const pickMusic = (
  list: AnyListen.Music.MusicInfoOnline[],
  params: { name: string; artist?: string }
): AnyListen.Music.MusicInfoOnline | null => {
  const name = params.name.trim()
  const artist = params.artist?.trim() ?? ''
  const sameName = list.filter((item) => item.name.trim() == name)
  if (artist) {
    const exact = sameName.find((item) => (item.singer ?? '').includes(artist))
    if (exact) return exact
  }
  if (sameName.length) return sameName[0]
  return list[0] ?? null
}

export const addDownloadTask = async (
  params: {
    name?: string
    artist?: string
    source?: string
    extensionId?: string
    musicInfo?: AnyListen.Music.MusicInfoOnline
  },
  options: DownloadOptions = {}
) => {
  const quality = options.quality ?? appState.appSetting['download.quality']
  const savePath = options.savePath ?? appState.appSetting['download.savePath']
  if (!savePath) throw new Error('download.savePath is empty')

  let musicInfo = params.musicInfo ?? null
  if (!musicInfo) {
    if (!params.name) throw new Error('name or musicInfo required')
    const result = await searchMusic({
      name: params.name,
      artist: params.artist,
      source: params.source,
      extensionId: params.extensionId,
    })
    musicInfo = pickMusic(result.list, { name: params.name, artist: params.artist })
    if (!musicInfo) throw new Error(`music not found: ${params.name}`)
  }

  const id = `${musicInfo.id}_${quality}`
  const exist = tasks.get(id)
  if (exist && exist.status == DOWNLOAD_STATUS.COMPLETED) return exist

  const task: DownloadTask = {
    id,
    musicInfo,
    requestedQuality: quality,
    actualQuality: '',
    actualBitrate: 0,
    qualityFallback: false,
    status: DOWNLOAD_STATUS.WAITING,
    statusText: '等待下载',
    progress: { progress: 0, speed: '', downloaded: 0, total: 0, writeQueue: 0 },
    ext: 'mp3',
    savePath,
    fileName: '',
    filePath: '',
    lrcPath: '',
    error: '',
    createdAt: now(),
    updatedAt: now(),
  }
  if (exist) {
    Object.assign(exist, {
      status: DOWNLOAD_STATUS.WAITING,
      statusText: '等待下载',
      error: '',
      progress: { progress: 0, speed: '', downloaded: 0, total: 0, writeQueue: 0 },
      updatedAt: now(),
    })
    schedule()
    return exist
  }

  tasks.set(task.id, task)
  persist(task, true)
  schedule()
  return task
}

export const removeDownloadTask = async (id: string) => {
  const task = tasks.get(id)
  if (!task) return false
  tasks.delete(id)
  try {
    workers.dbService.downloadInfoRemove([id])
  } catch (err) {
    console.log('remove download task failed:', (err as Error).message)
  }
  return true
}

export const clearDownloadTasks = async () => {
  tasks.clear()
  try {
    workers.dbService.downloadInfoClear()
  } catch (err) {
    console.log('clear download tasks failed:', (err as Error).message)
  }
}

const isTaskStatus = (status: string): status is DownloadTask['status'] =>
  ['run', 'waiting', 'pause', 'error', 'completed'].includes(status)

/** 从 download_list 表恢复任务（重启后仍能看到下载记录） */
export const initDownload = async () => {
  try {
    const list = (await workers.dbService.getDownloadList()) ?? []
    for (const item of list) {
      const status = isTaskStatus(item.status) ? item.status : DOWNLOAD_STATUS.COMPLETED
      const filePath = item.metadata.filePath ?? ''
      tasks.set(item.id, {
        id: item.id,
        musicInfo: item.metadata.musicInfo,
        requestedQuality: item.metadata.quality || appState.appSetting['download.quality'],
        actualQuality: '',
        actualBitrate: 0,
        qualityFallback: false,
        // 进程重启后不会自动续传，进行中的任务标记为等待
        status: status == DOWNLOAD_STATUS.RUN ? DOWNLOAD_STATUS.WAITING : status,
        statusText: item.statusText || '',
        progress: {
          progress: item.progress ?? 0,
          speed: item.speed ?? '',
          downloaded: item.downloaded ?? 0,
          total: item.total ?? 0,
          writeQueue: 0,
        },
        ext: item.metadata.ext ?? 'mp3',
        savePath: filePath ? dirname(filePath) : appState.appSetting['download.savePath'],
        fileName: item.metadata.fileName ?? '',
        filePath,
        lrcPath: '',
        error: status == DOWNLOAD_STATUS.ERROR ? item.statusText : '',
        createdAt: 0,
        updatedAt: 0,
      })
    }
    console.log(`[download] module ready, restored ${list.length} task(s)`)
  } catch (err) {
    console.log('[download] module ready, restore failed:', (err as Error).message)
  }
}
