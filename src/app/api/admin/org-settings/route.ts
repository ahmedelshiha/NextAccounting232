import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withTenantContext } from '@/lib/api-wrapper'
import { requireTenantContext } from '@/lib/tenant-utils'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'
import { tenantFilter } from '@/lib/tenant'
import { OrganizationSettingsSchema } from '@/schemas/settings/organization'
import { logAudit } from '@/lib/audit'
import * as Sentry from '@sentry/nextjs'
import type { Prisma } from '@prisma/client'

export const GET = withTenantContext(async () => {
  try {
    const ctx = requireTenantContext()
    if (!hasPermission(ctx.role || undefined, PERMISSIONS.ORG_SETTINGS_VIEW)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const scopedFilter = tenantFilter(ctx.tenantId)
    const scope = Object.keys(scopedFilter).length > 0 ? scopedFilter : { tenantId: ctx.tenantId }
    const row = await prisma.organizationSettings.findFirst({ where: scope }).catch(() => null)
    if (!row) return NextResponse.json({ name: '', tagline: '', description: '', industry: '' })

    const out = {
      general: { name: row.name, tagline: row.tagline, description: row.description, industry: row.industry },
      contact: { contactEmail: row.contactEmail, contactPhone: row.contactPhone, address: row.address || {} },
      localization: { defaultTimezone: row.defaultTimezone, defaultCurrency: row.defaultCurrency, defaultLocale: row.defaultLocale },
      branding: {
        logoUrl: row.logoUrl,
        branding: row.branding || {},
        termsUrl: row.termsUrl ?? null,
        privacyUrl: row.privacyUrl ?? null,
        refundUrl: row.refundUrl ?? null,
        legalLinks: { terms: row.termsUrl ?? null, privacy: row.privacyUrl ?? null, refund: row.refundUrl ?? null },
      },
    }
    return NextResponse.json(out)
  } catch (e) {
    try { Sentry.captureException(e as any) } catch {}
    return NextResponse.json({ error: 'Failed to load organization settings' }, { status: 500 })
  }
})

export const PUT = withTenantContext(async (req: Request) => {
  const ctx = requireTenantContext()
  if (!hasPermission(ctx.role || undefined, PERMISSIONS.ORG_SETTINGS_EDIT)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const parsed = OrganizationSettingsSchema.safeParse(body)
  if (!parsed.success) {
    try { Sentry.captureMessage('org-settings:validation_failed', { level: 'warning' } as any) } catch {}
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.format() }, { status: 400 })
  }
  const scopedFilter = tenantFilter(ctx.tenantId)
  const scope = Object.keys(scopedFilter).length > 0 ? scopedFilter : { tenantId: ctx.tenantId }
  const existing = await prisma.organizationSettings.findFirst({ where: scope }).catch(() => null)

  const rawData = {
    name: parsed.data.general?.name ?? existing?.name ?? '',
    tagline: parsed.data.general?.tagline ?? existing?.tagline ?? null,
    description: parsed.data.general?.description ?? existing?.description ?? null,
    industry: parsed.data.general?.industry ?? existing?.industry ?? null,
    contactEmail: parsed.data.contact?.contactEmail ?? existing?.contactEmail ?? null,
    contactPhone: parsed.data.contact?.contactPhone ?? existing?.contactPhone ?? null,
    address: parsed.data.contact?.address ?? existing?.address ?? undefined,
    defaultTimezone: parsed.data.localization?.defaultTimezone ?? existing?.defaultTimezone ?? 'UTC',
    defaultCurrency: parsed.data.localization?.defaultCurrency ?? existing?.defaultCurrency ?? 'USD',
    defaultLocale: parsed.data.localization?.defaultLocale ?? existing?.defaultLocale ?? 'en',
    logoUrl: parsed.data.branding?.logoUrl ?? existing?.logoUrl ?? null,
    branding: parsed.data.branding?.branding ?? existing?.branding ?? undefined,
    termsUrl: parsed.data.branding?.termsUrl ?? (parsed.data.branding?.legalLinks?.terms ?? existing?.termsUrl ?? null),
    privacyUrl: parsed.data.branding?.privacyUrl ?? (parsed.data.branding?.legalLinks?.privacy ?? existing?.privacyUrl ?? null),
    refundUrl: parsed.data.branding?.refundUrl ?? (parsed.data.branding?.legalLinks?.refund ?? existing?.refundUrl ?? null),
    legalLinks: parsed.data.branding?.legalLinks === undefined ? undefined : null,
  }

  const normalized: Record<string, any> = { ...rawData }
  if (normalized.address === null) normalized.address = null
  if (normalized.branding === null) normalized.branding = null
  if (normalized.legalLinks === null) normalized.legalLinks = null

  const createData = { ...normalized, tenant: { connect: { id: ctx.tenantId } } }
  const updateData = { ...normalized }

  try {
    const saved = existing
      ? await prisma.organizationSettings.update({ where: { id: existing.id }, data: updateData as Prisma.OrganizationSettingsUpdateInput })
      : await prisma.organizationSettings.create({ data: createData as Prisma.OrganizationSettingsCreateInput })

    try {
      await logAudit({ action: 'org-settings:update', actorId: ctx.userId, details: { tenantId: ctx.tenantId } })
    } catch {}

    return NextResponse.json({ ok: true, settings: saved })
  } catch (e) {
    try { Sentry.captureException(e as any) } catch {}
    return NextResponse.json({ error: 'Failed to update organization settings' }, { status: 500 })
  }
})
