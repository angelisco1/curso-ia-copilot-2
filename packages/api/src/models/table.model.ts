import {
    InvalidTableStatusError,
    InvalidTableNumberError,
    InvalidTableCapacityError,
    InvalidTableDescriptionError
} from '@errors/DomainErrors.js'

export const TABLE_STATUSES = ['libre', 'ocupada', 'reservada'] as const
export type TableStatus = typeof TABLE_STATUSES[number]

export interface RestaurantTable {
    id: string
    restaurantId: string
    number: number
    description: string
    capacity: number
    status: TableStatus
    activeSessionId: string | null
}

export interface TableInput {
    number: number
    description: string
    capacity: number
    status: TableStatus
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function asRecord(body: unknown): Record<string, unknown> {
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : {}
}

export function parseTableStatus(value: unknown): TableStatus {
    if (typeof value !== 'string' || !TABLE_STATUSES.includes(value as TableStatus)) {
        throw new InvalidTableStatusError(
            `Invalid table status: ${String(value)}. Must be one of: ${TABLE_STATUSES.join(', ')}`
        )
    }
    return value as TableStatus
}

export function parseTableNumber(value: unknown): number {
    if (!isPositiveInteger(value)) throw new InvalidTableNumberError()
    return value
}

export function parseTableCapacity(value: unknown): number {
    if (!isPositiveInteger(value)) throw new InvalidTableCapacityError()
    return value
}

export function parseTableDescription(value: unknown): string {
    if (typeof value !== 'string') throw new InvalidTableDescriptionError()
    return value
}

export function parseCreateTableInput(body: unknown): TableInput {
    const data = asRecord(body)
    return {
        number: parseTableNumber(data.number),
        description: data.description === undefined ? '' : parseTableDescription(data.description),
        capacity: parseTableCapacity(data.capacity),
        status: data.status === undefined ? 'libre' : parseTableStatus(data.status)
    }
}

export function parseReplaceTableInput(body: unknown): TableInput {
    const data = asRecord(body)
    return {
        number: parseTableNumber(data.number),
        description: parseTableDescription(data.description),
        capacity: parseTableCapacity(data.capacity),
        status: parseTableStatus(data.status)
    }
}
