import { mount, tick, unmount } from 'svelte'

import { onDesconnected } from '@/modules/app/shared'
import { i18n } from '@/plugins/i18n'
import { downloadAdd } from '@/shared/ipc/download'
import { showNotify } from '@/components/apis/notify'

/**
 * 弹出音质选择框，并把选中的歌曲加入服务端下载队列
 */
export const showDownloadModal = async (musicInfos: AnyListen.Music.MusicInfo[]) => {
  const onlineList = musicInfos.filter((info): info is AnyListen.Music.MusicInfoOnline => !info.isLocal)
  if (!onlineList.length) {
    showNotify(i18n.t('download_modal.local_not_supported'))
    return
  }

  const App = (await import('./DownloadModal.svelte')).default
  const app = mount(App, {
    target: document.getElementById('root')!,
    props: {
      onafterleave() {
        void unmount(app, { outro: true })
      },
    },
  })
  const release = () => {
    app.hide()
    unsub()
  }
  const unsub = onDesconnected(release)
  await tick()
  const quality = await (app.show(onlineList.length) as Promise<string | null>).finally(() => {
    unsub()
  })
  if (!quality) return

  try {
    const tasks = await downloadAdd({ musicInfos: onlineList, quality })
    showNotify(i18n.t('download_modal.added', { num: tasks.length }))
  } catch (err) {
    showNotify((err as Error).message)
  }
}
