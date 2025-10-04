import prisma from '@/lib/prisma'

import prisma from '@/lib/prisma'

export type IdempotencyRecord = {
  id: number
  key: string
  userId?: string | null
  tenantId: string
  entityType?: string | null
  entityId?: string | null
  status: 'RESERVED' | 'COMPLETED'
  createdAt: Date
  updatedAt: Date
  expiresAt?: Date | null
}

export async function reserveIdempotencyKey(key: string, userId?: string | null, tenantId?: string) {
  try {
    const rec = await prisma.idempotencyKey.create({ data: { key, userId: userId || undefined, tenantId: tenantId!, status: 'RESERVED' as any } })
    return rec as unknown as IdempotencyRecord
  } catch (e: any) {
    if (String(e?.code) === 'P2002') {
      const existing = await prisma.idempotencyKey.findUnique({ where: { key } })
      return existing as unknown as IdempotencyRecord
    }
    throw e
  }
}

export async function finalizeIdempotencyKey(key: string, entityType: string, entityId: string) {
  try {
    const rec = await prisma.idempotencyKey.update({ where: { key }, data: { entityType, entityId, status: 'COMPLETED' as any } })
    return rec as unknown as IdempotencyRecord
  } catch (e) {
    // swallow
    return null
  }
}

export async function findIdempotentResult(key: string) {
  const rec = await prisma.idempotencyKey.findUnique({ where: { key } })
  return rec as unknown as IdempotencyRecord | null
}
