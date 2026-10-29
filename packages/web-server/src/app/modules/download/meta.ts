import NodeID3 from 'node-id3'

export interface CoverImage {
  mime: string
  buffer: Buffer
}

export interface TagMeta {
  title: string
  artist: string
  album?: string
  lyric?: string
  cover?: CoverImage
}

/**
 * 写入 MP3 标签（ID3v2.3）：标题/艺术家/专辑 + 内嵌歌词(USLT) + 封面(APIC)
 */
export const writeMp3Tag = (filePath: string, meta: TagMeta) => {
  const tags: NodeID3.Tags = {
    title: meta.title,
    artist: meta.artist,
  }
  if (meta.album) tags.album = meta.album
  if (meta.lyric?.trim()) {
    tags.unsynchronisedLyrics = {
      language: 'zho',
      text: meta.lyric,
    }
  }
  if (meta.cover) {
    tags.image = {
      mime: meta.cover.mime,
      type: { id: 3 },
      description: '',
      imageBuffer: meta.cover.buffer,
    }
  }

  const result = NodeID3.write(tags, filePath)
  if (result !== true) throw new Error(`write id3 tag failed: ${(result as Error)?.message ?? String(result)}`)
}

export const guessImageMime = (buffer: Buffer) => {
  if (buffer.length > 3 && buffer[0] == 0xff && buffer[1] == 0xd8 && buffer[2] == 0xff) return 'image/jpeg'
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (buffer.length > 12 && buffer.subarray(0, 4).toString() == 'RIFF' && buffer.subarray(8, 12).toString() == 'WEBP') {
    return 'image/webp'
  }
  return 'image/jpeg'
}

// 部分网易云图片地址可以加参数拿更大的图
export const enhancePicUrl = (url: string) => {
  if (!url.includes('music.126.net')) return url
  return `${url}${url.includes('?') ? '&' : '?'}param=500y500`
}
