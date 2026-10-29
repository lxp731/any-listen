<script lang="ts">
  import Btn from '@/components/base/Btn.svelte'
  import Modal from '@/components/material/Modal.svelte'
  import { i18n, t } from '@/plugins/i18n'
  import { settingState } from '@/modules/setting/store/state'
  import { QUALITYS } from '@any-listen/common/constants'

  let { onafterleave }: { onafterleave?: () => void } = $props()

  /** 高 → 低 */
  const QUALITYS_DESC = [...QUALITYS].reverse()

  const QUALITY_SHORT_NAME: Record<string, string> = {
    '128k': '128K',
    '192k': '192K',
    '320k': '320K',
    wav: 'WAV',
    flac: 'FLAC',
    flac24bit: 'FLAC Hires',
    dolby: 'Dolby',
    master: 'Master',
  }

  const getQualityLabel = (quality: string) => {
    const shortName = QUALITY_SHORT_NAME[quality] ?? quality.toUpperCase()
    switch (quality) {
      case 'flac24bit':
      case 'dolby':
      case 'master':
        return `${i18n.t('download_tier_lossless')} ${shortName}`
      case 'flac':
      case 'wav':
        return `${i18n.t('download_tier_lossless')} ${shortName}`
      case '320k':
        return `${i18n.t('download_tier_high')} ${shortName}`
      default:
        return `${i18n.t('download_tier_normal')} ${shortName}`
    }
  }

  interface QualityOption {
    value: string
    label: string
    sizeStr: string
    disabled: boolean
    countText: string
  }

  let visible = $state(false)
  let musicInfos = $state.raw<AnyListen.Music.MusicInfoOnline[]>([])
  let options = $state.raw<QualityOption[]>([])
  let selected = $state('320k')
  let hasQualityInfo = $state(true)
  let resolveShow: ((quality: string | null) => void) | null = null

  const buildOptions = (list: AnyListen.Music.MusicInfoOnline[]) => {
    const withInfo = list.filter((info) => {
      const qualitys = info.meta?.qualitys
      return !!qualitys && Object.keys(qualitys).length > 0
    })
    hasQualityInfo = withInfo.length > 0
    const total = list.length
    const single = list.length === 1 ? list[0] : null

    return QUALITYS_DESC.map((quality) => {
      const count = withInfo.filter((info) => info.meta?.qualitys?.[quality]).length
      return {
        value: quality,
        label: getQualityLabel(quality),
        sizeStr: single?.meta?.qualitys?.[quality]?.sizeStr ?? '',
        // 单曲：本身没有就置灰；多选：全部歌曲都没有才置灰
        disabled: hasQualityInfo ? count === 0 : false,
        countText: total > 1 && hasQualityInfo ? i18n.t('download_quality_count', { num: count, total }) : '',
      } satisfies QualityOption
    }).filter((item) => !hasQualityInfo || !item.disabled || total > 1)
  }

  const initOptions = (list: AnyListen.Music.MusicInfoOnline[]) => {
    const list_ = buildOptions(list)
    options = list_
    const settingQuality = settingState.setting['download.quality']
    const firstEnabled = list_.find((item) => !item.disabled)
    selected = list_.some((item) => item.value === settingQuality && !item.disabled)
      ? settingQuality
      : (firstEnabled?.value ?? settingQuality)
  }

  const handleClose = () => {
    resolveShow?.(null)
    resolveShow = null
    visible = false
  }

  const handleSubmit = () => {
    const target = options.find((item) => item.value === selected)
    if (target?.disabled) return
    resolveShow?.(selected)
    resolveShow = null
    visible = false
  }

  export const hide = () => {
    handleClose()
  }

  export const show = async (list: AnyListen.Music.MusicInfoOnline[]) => {
    resolveShow?.(null)
    resolveShow = null
    musicInfos = list
    initOptions(list)
    visible = true
    return new Promise<string | null>((resolve) => {
      resolveShow = resolve
    })
  }
</script>

<Modal bind:visible teleport="#view" minheight="0" onclose={handleClose} {onafterleave}>
  <main class="main">
    <h2>
      {#if musicInfos.length > 1}
        {$t('download_modal.title_multiple', { num: musicInfos.length })}
      {:else}
        {$t('download_modal.title')}
        <span class="song">{$t('download_modal.song_tip', { name: musicInfos[0]?.name ?? '' })}</span>
      {/if}
    </h2>

    <div class="qualitys">
      {#if musicInfos.length > 1}
        <label class="quality auto" class:active={selected === 'auto'}>
          <input type="radio" name="download-quality" value="auto" bind:group={selected} />
          <span class="label">{$t('download_quality_auto')}</span>
        </label>
      {/if}
      {#each options as option (option.value)}
        <label class="quality" class:active={selected === option.value} class:disabled={option.disabled}>
          <input
            type="radio"
            name="download-quality"
            value={option.value}
            disabled={option.disabled}
            bind:group={selected}
          />
          <span class="label">{option.label}</span>
          {#if option.sizeStr}
            <span class="size">{option.sizeStr.toUpperCase()}</span>
          {/if}
          {#if option.countText}
            <span class="count">{option.countText}</span>
          {/if}
        </label>
      {/each}
    </div>

    <p class="tip">
      {#if !hasQualityInfo}
        {$t('download_modal.no_quality_info')}
      {:else}
        {$t('download_modal.quality_tip')}
      {/if}
    </p>

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
    min-width: 320px;
    max-width: 520px;
    min-height: 0;
    padding: 0 15px;

    h2 {
      display: flex;
      flex-flow: column nowrap;
      gap: 4px;
      padding: 15px 0 10px;
      font-size: 13px;
      line-height: 1.3;
      color: var(--color-font);
    }
    .song {
      .mixin-ellipsis-1();
      font-size: 11px;
      color: var(--color-font-label);
    }
  }
  .qualitys {
    display: flex;
    flex-flow: column nowrap;
    gap: 6px;
  }
  .quality {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 7px 12px;
    font-size: 12px;
    color: var(--color-font);
    cursor: pointer;
    background-color: var(--color-primary-light-300-alpha-700);
    border: 1px solid transparent;
    border-radius: @radius-border;
    transition: @transition-fast;
    transition-property: background-color, color, opacity;

    input {
      position: absolute;
      width: 0;
      height: 0;
      opacity: 0;
    }
    .label {
      flex: none;
    }
    .size,
    .count {
      font-size: 11px;
      color: var(--color-font-label);
    }
    .size {
      margin-left: auto;
    }
    &:not(.disabled):hover {
      background-color: var(--color-primary-light-400-alpha-900);
    }
    &.active {
      color: var(--color-primary-font);
      background-color: var(--color-primary-light-400-alpha-900);
      border-color: var(--color-primary-alpha-500, var(--color-primary));
    }
    &.disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
    &.auto {
      color: var(--color-font);
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
