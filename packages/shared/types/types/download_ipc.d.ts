declare namespace AnyListen {
  namespace IPCDownload {
    /** 下载任务信息（暴露给前端的部分） */
    interface TaskInfo {
      id: string
      musicInfo: Music.MusicInfoOnline
      /** 请求的音质 */
      requestedQuality: string
      /** 实测音质描述，如 `MPEG 1 Layer 3 320k` */
      actualQuality: string
      /** 实测码率 kbps */
      actualBitrate: number
      /** 请求音质与实际不符（音源回落） */
      qualityFallback: boolean
      status: Download.DownloadTaskStatus
      statusText: string
      progress: Download.ProgressInfo
      ext: Download.FileExt
      fileName: string
      filePath: string
      error: string
      createdAt: number
      updatedAt: number
    }

    interface SearchResult {
      source: string
      extensionId: string
      list: Music.MusicInfoOnline[]
    }

    interface AddParams {
      musicInfos: Music.MusicInfoOnline[]
      quality?: string
      savePath?: string
    }

    interface SearchParams {
      name: string
      artist?: string
      source?: string
      limit?: number
    }

    type ServerActions = WarpPromiseRecord<{
      /** 服务端搜索歌曲 */
      downloadSearch: (params: SearchParams) => SearchResult
      /** 添加下载任务（批量） */
      downloadAdd: (params: AddParams) => TaskInfo[]
      /** 获取下载任务列表 */
      downloadTasks: () => TaskInfo[]
      /** 移除下载任务 */
      downloadRemove: (ids: string[]) => void
      /** 清空下载任务 */
      downloadClear: () => void
      /** 可用音质列表 */
      downloadQualitys: () => string[]
    }>
    type ServerIPCActions<Socket = undefined> = IPC.WarpIPCHandlerActions<Socket, ServerActions>
  }
}
