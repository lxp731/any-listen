<script lang="ts">
  import Btn from '@/components/base/Btn.svelte'
  import Modal from '@/components/material/Modal.svelte'
  import { t } from '@/plugins/i18n'
  import { downloadQualitys } from '@/shared/ipc/download'
  import { settingState } from '@/modules/setting/store/state'
  import { QUALITYS } from '@any-listen/common/constants'

  let { onafterleave }: { onafterleave?: () => void } = $props()

  const QUALITY_NAMES: Record<string, string> = {
    '128k': '128k',
    '192k': '192k',
    '320k': '320k',
    wav: 'WAV',
    flac: 'FLAC',
    flac24bit: 'FLAC 24bit',
    dolby: 'Dolby',
    master: 'Master',
  }

  let visible = $state(false)
  let qualitys = $state.raw<string[]>([...QUALITYS])
  let selected = $state('320k')
  let count = $state(0)
  let resolveShow: ((quality: string | null) => void) | null = null

  $effect(() => {
    if (!visible) return
    void downloadQualitys().then((list) => {
      qualitys = list
    })
  })

  const handleClose = () => {
    resolveShow?.(null)
    resolveShow = null
    visible = false
  }

  const handleSubmit = () => {
    resolveShow?.(selected)
    resolveShow = null
    visible = false
  }

  export const hide = () => {
    handleClose()
  }

  export const show = async (_count = 1) => {
    resolveShow?.(null)
    resolveShow = null
    count = _count
    const settingQuality = settingState.setting['download.quality']
    selected = qualitys.includes(settingQuality) ? settingQuality : '320k'
    visible = true
    return new Promise<string | null>((resolve) => {
      resolveShow = resolve
    })
  }
</script>

<Modal bind:visible teleport="#view" minheight="0" onclose={handleClose} {onafterleave}>
  <main class="main">
    <h2>
      {#if count > 1}
        {$t('download_modal.title_multiple', { num: count })}
      {:else}
        {$t('download_modal.title')}
      {/if}
    </h2>

    <div class="qualitys">
      {#each qualitys as quality (quality)}
        <label class="quality" class:active={selected === quality}>
          <input type="radio" name="download-quality" value={quality} bind:group={selected} />
          <span>{QUALITY_NAMES[quality] ?? quality}</span>
        </label>
      {/each}
    </div>

    <p class="tip">{$t('download_modal.quality_tip')}</p>

    <div class="footer">
      <Btn class={['btn']} onclick={handleClose}>{$t('btn_cancel')}</Btn>
      <Btn class={['btn']} primary onclick={handleSubmit}>{$t('download_modal.start')}</Btn>
    </div>
  </main>
</Modal>

<style lang="less">
  .main {
    display: flex;
    flex-flow: column nowrap;
    min-width: 300px;
    max-width: 480px;
    min-height: 0;
    padding: 0 15px;

    h2 {
      padding: 15px 0 10px;
      font-size: 13px;
      line-height: 1.3;
      color: var(--color-font);
    }
  }
  .qualitys {
    display: flex;
    flex-flow: row wrap;
    gap: 8px;
  }
  .quality {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    font-size: 12px;
    color: var(--color-font);
    cursor: pointer;
    background-color: var(--color-primary-light-300-alpha-700);
    border-radius: @radius-border;
    transition: @transition-fast;
    transition-property: background-color, color;

    input {
      position: absolute;
      width: 0;
      height: 0;
      opacity: 0;
    }
    &.active,
    &:hover {
      background-color: var(--color-primary-light-400-alpha-900);
    }
    &.active {
      color: var(--color-primary-font);
    }
  }
  .tip {
    margin-top: 12px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--color-font-label);
  }
  .footer {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin: 20px 0 15px;
    :global(.btn) {
      min-width: 70px;
    }
  }
</style>
