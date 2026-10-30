import { describe, it, expect } from 'vitest'
import { parsePartySize, parseConfirmOccupancyInput, parseStatusChangeInput } from './table-session.model.js'
import { InvalidPartySizeError, InvalidTableStatusError, InvalidTableIdError } from '@errors/DomainErrors.js'

describe('table session model validation', () => {
    it.each([0, -3, 2.5, '3', '', null, undefined, NaN, true, {}])('rechaza partySize %j', value => {
        expect(() => parsePartySize(value)).toThrow(InvalidPartySizeError)
    })

    it('acepta enteros positivos', () => {
        expect(parsePartySize(1)).toBe(1)
        expect(parsePartySize(12)).toBe(12)
    })

    it('mensaje de grupo coincide con el contrato', () => {
        expect(() => parsePartySize(0)).toThrow('Party size must be a positive integer')
    })

    it('parseConfirmOccupancyInput valida tableId y partySize', () => {
        expect(parseConfirmOccupancyInput({ tableId: 't1', partySize: 3 })).toEqual({ tableId: 't1', partySize: 3 })
        expect(() => parseConfirmOccupancyInput({ partySize: 3 })).toThrow(InvalidTableIdError)
        expect(() => parseConfirmOccupancyInput({ tableId: '', partySize: 3 })).toThrow(InvalidTableIdError)
        expect(() => parseConfirmOccupancyInput({ tableId: 5, partySize: 3 })).toThrow(InvalidTableIdError)
        expect(() => parseConfirmOccupancyInput({ tableId: 't1' })).toThrow(InvalidPartySizeError)
        expect(() => parseConfirmOccupancyInput(null)).toThrow(InvalidTableIdError)
    })

    it('parseStatusChangeInput exige un estado valido', () => {
        expect(parseStatusChangeInput({ status: 'libre' })).toBe('libre')
        expect(() => parseStatusChangeInput({ status: 'x' })).toThrow(InvalidTableStatusError)
        expect(() => parseStatusChangeInput({})).toThrow(InvalidTableStatusError)
        expect(() => parseStatusChangeInput(undefined)).toThrow(InvalidTableStatusError)
    })
})
