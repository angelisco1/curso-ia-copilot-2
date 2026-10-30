import { describe, expect, it } from 'vitest'
import { isClosedVisit, tableLabel } from './table-label'

describe('table-label', () => {
  it('usa tableNumber cuando existe', () => {
    expect(tableLabel({ tableId: 'uuid', tableNumber: 7 })).toBe('7')
    expect(tableLabel({ tableId: null, tableNumber: 0 })).toBe('0')
  })
  it('recurre a tableId en pedidos antiguos y devuelve null sin mesa', () => {
    expect(tableLabel({ tableId: '5' })).toBe('5')
    expect(tableLabel({ tableId: '5', tableNumber: null })).toBe('5')
    expect(tableLabel({ tableId: null })).toBeNull()
  })
  it('detecta visitas cerradas solo con fecha de fin', () => {
    expect(isClosedVisit({ tableSessionEndedAt: '2026-10-29T10:00:00Z' })).toBe(true)
    expect(isClosedVisit({ tableSessionEndedAt: null })).toBe(false)
    expect(isClosedVisit({})).toBe(false)
  })
})
