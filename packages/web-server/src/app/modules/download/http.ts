import { toSha256 } from '@any-listen/nodejs'
import type Router from '@koa/router'

import { getLoginPassword } from '@/shared/data'

import { addDownloadTask, clearDownloadTasks, getDownloadTasks, removeDownloadTask, searchMusic } from './index'

const readJsonBody = async (req: NodeJS.ReadableStream): Promise<Record<string, any>> => {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, any>
  } catch {
    throw new Error('invalid json body')
  }
}

/**
 * 复用登录口令鉴权：请求头 m = sha256(password + salt)，s = salt
 * 与既有 /api/ipc/ah 的口令校验方式保持一致，不引入新的鉴权体系。
 */
const verifyAuth = (ctx: AnyListen.RequestContext) => {
  const password = getLoginPassword()
  if (!password) return true
  const m = ctx.headers.m
  const s = ctx.headers.s
  if (typeof m != 'string' || typeof s != 'string' || !m || !s) return false
  return m == toSha256(password + s)
}

const reply = (ctx: AnyListen.RequestContext, data: unknown, status = 200) => {
  ctx.status = status
  ctx.body = { code: status == 200 ? 0 : status, data, message: status == 200 ? 'ok' : String(data) }
}

const handleError = (ctx: AnyListen.RequestContext, err: unknown) => {
  const message = (err as Error)?.message ?? String(err)
  reply(ctx, message, 500)
}

export const registerDownloadRouter = (router: Router<unknown, AnyListen.RequestContext>) => {
  router.post('/download/search', async (ctx) => {
    if (!verifyAuth(ctx)) return reply(ctx, 'unauthorized', 401)
    try {
      const body = await readJsonBody(ctx.req)
      const result = await searchMusic({
        name: String(body.name ?? ''),
        artist: body.artist ? String(body.artist) : undefined,
        source: body.source ? String(body.source) : undefined,
        extensionId: body.extensionId ? String(body.extensionId) : undefined,
        limit: body.limit ? Number(body.limit) : undefined,
      })
      reply(ctx, result)
    } catch (err) {
      handleError(ctx, err)
    }
  })

  router.post('/download/add', async (ctx) => {
    if (!verifyAuth(ctx)) return reply(ctx, 'unauthorized', 401)
    try {
      const body = await readJsonBody(ctx.req)
      const task = await addDownloadTask(
        {
          name: body.name ? String(body.name) : undefined,
          artist: body.artist ? String(body.artist) : undefined,
          source: body.source ? String(body.source) : undefined,
          extensionId: body.extensionId ? String(body.extensionId) : undefined,
          musicInfo: body.musicInfo,
        },
        {
          quality: body.quality ? String(body.quality) : undefined,
          savePath: body.savePath ? String(body.savePath) : undefined,
          fileName: body.fileName ? String(body.fileName) : undefined,
        }
      )
      reply(ctx, task)
    } catch (err) {
      handleError(ctx, err)
    }
  })

  router.get('/download/tasks', async (ctx) => {
    if (!verifyAuth(ctx)) return reply(ctx, 'unauthorized', 401)
    reply(ctx, getDownloadTasks())
  })

  router.post('/download/remove', async (ctx) => {
    if (!verifyAuth(ctx)) return reply(ctx, 'unauthorized', 401)
    try {
      const body = await readJsonBody(ctx.req)
      if (body.id) await removeDownloadTask(String(body.id))
      else if (body.all) await clearDownloadTasks()
      reply(ctx, getDownloadTasks())
    } catch (err) {
      handleError(ctx, err)
    }
  })
}
