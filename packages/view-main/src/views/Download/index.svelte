<script lang="ts">
  import { onDestroy, onMount } from 'svelte'

  import Btn from '@/components/base/Btn.svelte'
  import { t } from '@/plugins/i18n'
  import { downloadClear, downloadRemove, downloadTasks } from '@/shared/ipc/download'
  import { showNotify } from '@/components/apis/notify'
  import { showSimpleConfirmModal } from '@/components/apis/dialog'

  const POLL_INTERVAL = 1500

  let tasks = $state.raw<AnyListen.IPCDownload.TaskInfo[]>([])
  let loading = $state(true)
  let timer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false

  const runningCount = $derived(tasks.filter((task) => task.status == 'run' || task.status == 'waiting').length)

  const refresh = async () => {
    if (destroyed) return
    try {
      tasks = await downloadTasks()
    } catch (err) {
      console.log('get download tasks failed:', err)
    } finally {
      loading = false
      if (destroyed) return
      timer = setTimeout(() => {
        void refresh()
      }, POLL_INTERVAL)
    }
  }

  onMount(() => {
    void refresh()
  })

  onDestroy(() => {
    destroyed = true
    if (timer) clearTimeout(timer)
    timer = null
  })

  const statusLabel = (status: AnyListen.Download.DownloadTaskStatus) => {
    switch (status) {
      case 'run':
        return t('download_status_run')
      case 'waiting':
        return t('download_status_waiting')
      case 'pause':
        return t('download_status_pause')
      case 'error':
        return t('download_status_error')
      case 'completed':
        return t('download_status_completed')
      default:
        return status
    }
  }

  const handleRemove = async (task: AnyListen.IPCDownload.TaskInfo) => {
    const ok = await showSimpleConfirmModal(t('download_tip_remove_tip', { name: task.musicInfo.name }))
    if (!ok) return
    await downloadRemove([task.id])
    tasks = tasks.filter((item) => item.id != task.id)
  }

  const handleClear = async () => {
    if (!tasks.length) return
    const ok = await showSimpleConfirmModal(t('download_tip_clear_tip'))
    if (!ok) return
    await downloadClear()
    tasks = []
    showNotify(t('download_clear_success'))
  }
</script>

<div class="view-container container">
  <header class="header">
    <h2>
      {$t('download')}
      {#if runningCount > 0}
        <span class="running">({runningCount})</span>
      {/if}
    </h2>
    <div class="actions">
      <Btn disabled={!tasks.length} onclick={handleClear}>{$t('download_clear')}</Btn>
    </div>
  </header>

  {#if loading}
    <div class="empty">{$t('download_loading')}</div>
  {:else if !tasks.length}
    <div class="empty">{$t('download_empty')}</div>
  {:else}
    <div class="list">
      <div class="row head">
        <span class="col-name">{$t('download_col_name')}</span>
        <span class="col-status">{$t('download_col_status')}</span>
        <span class="col-quality">{$t('download_col_quality')}</span>
        <span class="col-action"></span>
      </div>
      {#each tasks as task (task.id)}
        <div class="row" class:completed={task.status == 'completed'} class:error={task.status == 'error'}>
          <span class="col-name">
            <span class="name" title={task.fileName || task.musicInfo.name}>{task.musicInfo.name}</span>
            <span class="singer">{task.musicInfo.singer}</span>
          </span>
          <span class="col-status">
            <span class="status-text">
              {#if task.status == 'error'}
                {task.error || task.statusText}
              {:else if task.status == 'run' && task.progress.progress > 0}
                {statusLabel(task.status)} {task.progress.progress}% {task.progress.speed ? `/ ${task.progress.speed}/s` : ''}
              {:else}
                {task.statusText || statusLabel(task.status)}
              {/if}
            </span>
            {#if task.status == 'run' && task.progress.progress > 0}
              <span class="progress-bar"><span class="inner" style="width: {task.progress.progress}%"></span></span>
            {/if}
          </span>
          <span class="col-quality">
            {#if task.actualBitrate}
              <span class="actual" class:fallback={task.qualityFallback}>{task.actualBitrate}k</span>
              {#if task.qualityFallback}
                <span class="req">/ {$t('download_requested')} {task.requestedQuality}</span>
              {/if}
            {:else}
              <span class="req">{task.requestedQuality}</span>
            {/if}
            {#if task.qualityFallback}
              <span class="badge-fallback" title={$t('download_quality_fallback_tip')}>{$t('download_quality_fallback')}</span>
            {/if}
          </span>
          <span class="col-action">
            <button class="btn-link" onclick={() => handleRemove(task)}>{$t('download_remove')}</button>
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style lang="less">
  .container {
    display: flex;
    flex-flow: column nowrap;
    min-height: 0;
  }
  .header {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    padding: 8px 15px;
    h2 {
      display: flex;
      gap: 6px;
      align-items: center;
      font-size: 16px;
      color: var(--color-font);
    }
    .running {
      font-size: 12px;
      color: var(--color-font-label);
    }
  }
  .empty,
  .loading {
    padding: 60px 0;
    font-size: 13px;
    color: var(--color-font-label);
    text-align: center;
  }
  .list {
    display: flex;
    flex: auto;
    flex-flow: column nowrap;
    min-height: 0;
    margin: 0 15px 15px;
    overflow-y: auto;
    border-radius: @radius-border;
  }
  .row {
    display: flex;
    flex: none;
    gap: 10px;
    align-items: center;
    padding: 8px 10px;
    font-size: 12px;
    color: var(--color-font);
    &:hover:not(.head) {
      background-color: var(--color-primary-light-400-alpha-700);
    }
    &.completed {
      opacity: 0.85;
    }
    &.error {
      color: var(--color-font-error);
    }
    &.head {
      position: sticky;
      top: 0;
      z-index: 1;
      font-size: 11px;
      color: var(--color-font-label);
      background-color: var(--color-app-background);
    }
  }
  .col-name {
    display: flex;
    flex: auto;
    gap: 8px;
    align-items: center;
    min-width: 0;
    overflow: hidden;
    .name {
      .mixin-ellipsis-1();
      color: var(--color-font);
    }
    .singer {
      flex: none;
      .mixin-ellipsis-1();
      max-width: 40%;
      font-size: 11px;
      color: var(--color-font-label);
    }
  }
  .col-status {
    display: flex;
    flex: none;
    flex-flow: column nowrap;
    gap: 3px;
    width: 190px;
    .status-text {
      .mixin-ellipsis-1();
      font-size: 11px;
      color: var(--color-font-label);
    }
    .progress-bar {
      display: block;
      width: 100%;
      height: 3px;
      overflow: hidden;
      background-color: var(--color-primary-light-300-alpha-700);
      border-radius: 2px;
      .inner {
        display: block;
        height: 100%;
        background-color: var(--color-primary);
        transition: width 0.3s;
      }
    }
  }
  .col-quality {
    display: flex;
    flex: none;
    gap: 6px;
    align-items: center;
    width: 150px;
    font-size: 11px;
    .req {
      color: var(--color-font-label);
    }
    .actual {
      color: var(--color-font);
      &.fallback {
        color: var(--color-font-warning);
      }
    }
    .badge-fallback {
      padding: 0 4px;
      font-size: 10px;
      line-height: 16px;
      color: var(--color-font-warning);
      border: 1px solid var(--color-font-warning);
      border-radius: 8px;
    }
  }
  .col-action {
    flex: none;
    width: 60px;
    text-align: right;
    .btn-link {
      padding: 2px 4px;
      font-size: 11px;
      color: var(--color-font-label);
      cursor: pointer;
      background: none;
      border: none;
      transition: @transition-fast;
      transition-property: color;
      &:hover {
        color: var(--color-font-error);
      }
    }
  }
</style>
