export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { withTenantContext } from '@/lib/api-wrapper'
import { requireTenantContext } from '@/lib/tenant-utils'

function withDeprecationHeaders(init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Deprecation', 'true')
  headers.set('Sunset', new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toUTCString())
  headers.set('Link', '</api/admin/service-requests>; rel="successor-version"')
  return { ...init, headers }
}

function cloneRequestWithUrl(req: NextRequest | Request, url: URL, body?: any, method?: string): Request {
  const init: RequestInit = {
    method: method || (req as Request).method,
    headers: (req as Request).headers,
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  }
  return new Request(url.toString(), init)
}

export const GET = withTenantContext(async (request: NextRequest) => {
  const ctx = requireTenantContext()
  if (!ctx.userId) return NextResponse.json({ success: false, error: { message: 'Unauthorized' } }, withDeprecationHeaders({ status: 401 }))

  const url = new URL(request.url)
  if (!url.searchParams.get('type')) {
    url.searchParams.set('type', 'appointments')
  }

  try {
    const role = ctx.role ?? undefined
    if (role === 'ADMIN' || role === 'TEAM_LEAD' || role === 'TEAM_MEMBER' || role === 'SUPER_ADMIN') {
      const mod = await import('@/app/api/admin/service-requests/route')
      const resp: Response = await mod.GET(cloneRequestWithUrl(request, url) as any, {} as any)
      const data = await resp.json().catch(() => null)
      return NextResponse.json(data, withDeprecationHeaders({ status: resp.status }))
    } else {
      const mod = await import('@/app/api/portal/service-requests/route')
      const resp: Response = await mod.GET(cloneRequestWithUrl(request, url) as any, {} as any)
      const data = await resp.json().catch(() => null)
      return NextResponse.json(data, withDeprecationHeaders({ status: resp.status }))
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, error: { message: 'Failed to fetch bookings' } }, withDeprecationHeaders({ status: 500 }))
  }
})

export const POST = withTenantContext(async (request: NextRequest) => {
  const ctx = requireTenantContext()
  if (!ctx.userId) return NextResponse.json({ success: false, error: { message: 'Unauthorized' } }, withDeprecationHeaders({ status: 401 }))

  let legacy: any = null
  try {
    legacy = await request.json()
  } catch {}

  const bookingDetails: any = {
    scheduledAt: legacy?.scheduledAt,
    duration: legacy?.duration,
    clientName: legacy?.clientName,
    clientEmail: legacy?.clientEmail,
    clientPhone: legacy?.clientPhone,
    assignedTeamMemberId: legacy?.assignedTeamMemberId,
  }

  const basePayload: any = {
    serviceId: legacy?.serviceId,
    title: legacy?.title || undefined,
    description: legacy?.notes || legacy?.description || undefined,
    requirements: { ...(legacy?.requirements || {}), booking: bookingDetails },
    attachments: legacy?.attachments || undefined,
  }

  if (legacy?.scheduledAt) {
    ;(basePayload as any).isBooking = true
    ;(basePayload as any).scheduledAt = legacy.scheduledAt
    if (legacy?.duration != null) (basePayload as any).duration = legacy.duration
    if (legacy?.clientName) (basePayload as any).clientName = legacy.clientName
    if (legacy?.clientEmail) (basePayload as any).clientEmail = legacy.clientEmail
    if (legacy?.clientPhone) (basePayload as any).clientPhone = legacy.clientPhone
    if (legacy?.bookingType) (basePayload as any).bookingType = legacy.bookingType
    if (legacy?.recurringPattern) (basePayload as any).recurringPattern = legacy.recurringPattern
  }

  const role = ctx.role ?? undefined
  const url = new URL(request.url)

  try {
    if (role === 'ADMIN' || role === 'TEAM_LEAD' || role === 'TEAM_MEMBER' || role === 'SUPER_ADMIN') {
      basePayload.clientId = legacy?.clientId || ctx.userId
      if (legacy?.assignedTeamMemberId) (basePayload as any).assignedTeamMemberId = legacy.assignedTeamMemberId
      const mod = await import('@/app/api/admin/service-requests/route')
      const resp: Response = await mod.POST(cloneRequestWithUrl(request, url, basePayload, 'POST') as any, {} as any)
      const data = await resp.json().catch(() => null)
      return NextResponse.json(data, withDeprecationHeaders({ status: resp.status }))
    } else {
      const mod = await import('@/app/api/portal/service-requests/route')
      const resp: Response = await mod.POST(cloneRequestWithUrl(request, url, basePayload, 'POST') as any, {} as any)
      const data = await resp.json().catch(() => null)
      return NextResponse.json(data, withDeprecationHeaders({ status: resp.status }))
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, error: { message: 'Failed to create booking' } }, withDeprecationHeaders({ status: 500 }))
  }
})
