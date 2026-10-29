import { InvalidPartySizeError, InvalidTableIdError } from '@errors/DomainErrors.js'
import { parseTableStatus } from './table.model.js'
import type { TableStatus } from './table.model.js'

export interface TableSession {
    id: string
    restaurantId: string
    tableId: string
    clientId: string | null
    partySize: number | null
    startedAt: string
    endedAt: string | null
}

export function parsePartySize(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new InvalidPartySizeError()
    return value
}

function asRecord(body: unknown): Record<string, unknown> {
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : {}
}

export function parseConfirmOccupancyInput(body: unknown): { tableId: string; partySize: number } {
    const data = asRecord(body)
    if (typeof data.tableId !== 'string' || data.tableId.trim() === '') throw new InvalidTableIdError()
    return { tableId: data.tableId, partySize: parsePartySize(data.partySize) }
}

export function parseStatusChangeInput(body: unknown): TableStatus {
    return parseTableStatus(asRecord(body).status)
}
