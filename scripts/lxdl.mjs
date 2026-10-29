#!/usr/bin/env node
// 阶段一 CLI：通过 web-server 的 /api/download/* 接口搜索并下载歌曲
// 用法：
//   node lxdl.mjs search "富士山下" "陈奕迅" [source]
//   node lxdl.mjs add "富士山下" "陈奕迅" [source] [quality] [savePath]
//   node lxdl.mjs tasks
import crypto from 'node:crypto'

const BASE = process.env.LX_BASE ?? 'http://127.0.0.1:9500'
const PWD = process.env.LX_PWD ?? 'admin123'

const authHeaders = () => {
  const salt = crypto.randomBytes(8).toString('hex')
  const m = crypto.createHash('sha256').update(PWD + salt).digest('hex')
  return { 'content-type': 'application/json', m, s: salt }
}

const api = async (path, body) => {
  const resp = await fetch(`${BASE}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: authHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await resp.json().catch(() => ({}))
  if (json.code !== 0) throw new Error(`${path} -> ${resp.status} ${json.data ?? ''} ${json.message ?? ''}`)
  return json.data
}

const fmtTask = (t) =>
  [
    `[${t.status}]`,
    `${t.musicInfo.name} - ${t.musicInfo.singer}`,
    `req=${t.requestedQuality}`,
    `actual=${t.actualQuality || '-'}`,
    t.actualBitrate ? `bitrate=${t.actualBitrate}k` : '',
    t.qualityFallback ? '(码率回落)' : '',
    t.fileName ? `-> ${t.fileName}` : '',
    t.error ? `err=${t.error}` : '',
  ]
    .filter(Boolean)
    .join(' ')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const cmd = process.argv[2]
const args = process.argv.slice(3)

if (cmd === 'search') {
  const [name, artist, source] = args
  const result = await api('/download/search', { name, artist, source, limit: 10 })
  console.log(`source: ${result.source} (extension: ${result.extensionId})`)
  result.list.forEach((m, i) => {
    console.log(`${i + 1}. ${m.name} - ${m.singer} | ${m.meta?.albumName ?? ''} | ${m.interval ?? ''} | ${m.id}`)
  })
} else if (cmd === 'add') {
  const [name, artist, source, quality, savePath] = args
  const task = await api('/download/add', { name, artist, source, quality, savePath })
  console.log('task created:', fmtTask(task))
  for (let i = 0; i < 300; i++) {
    await sleep(2000)
    const tasks = await api('/download/tasks')
    const current = tasks.find((t) => t.id === task.id)
    if (!current) break
    if (current.status === 'completed' || current.status === 'error') {
      console.log(fmtTask(current))
      process.exit(current.status === 'completed' && !current.error ? 0 : 1)
    }
    if (i % 5 === 0) console.log(fmtTask(current))
  }
  console.log('timeout')
  process.exit(2)
} else if (cmd === 'tasks') {
  const tasks = await api('/download/tasks')
  if (!tasks.length) console.log('(empty)')
  tasks.forEach((t) => console.log(fmtTask(t)))
} else {
  console.log('usage: lxdl.mjs search|add|tasks ...')
  process.exit(1)
}
