import { randomUUID } from 'crypto'
import prisma from '@/lib/prisma'

let cachedDefaultTenantId: string | null = null

async function ensureDefaultTenant(): Promise<string> {
  if (cachedDefaultTenantId) return cachedDefaultTenantId

  const primary = await prisma.tenant.findFirst({ where: { slug: 'primary' } })
  if (primary?.id) {
    cachedDefaultTenantId = primary.id
    return primary.id
  }

  const existing = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } })
  if (existing?.id) {
    cachedDefaultTenantId = existing.id
    return existing.id
  }

  const generatedId = `tenant_${randomUUID().replace(/-/g, '').slice(0, 24)}`
  const created = await prisma.tenant.create({
    data: {
      id: generatedId,
      slug: 'primary',
      name: 'Primary Tenant',
      status: 'ACTIVE',
    },
  })
  cachedDefaultTenantId = created.id
  return created.id
}

export async function resolveTenantId(tenantId: string | null | undefined): Promise<string> {
  if (tenantId && tenantId.trim().length > 0) return tenantId
  return ensureDefaultTenant()
}

export async function getDefaultTenantId(): Promise<string> {
  return ensureDefaultTenant()
}
