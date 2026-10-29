import { describe, it, expect } from 'vitest'
import {
    TABLE_STATUSES,
    parseTableStatus,
    parseTableNumber,
    parseTableCapacity,
    parseTableDescription,
    parseCreateTableInput,
    parseReplaceTableInput
} from './table.model.js'
import {
    InvalidTableStatusError,
    InvalidTableNumberError,
    InvalidTableCapacityError,
    InvalidTableDescriptionError
} from '@errors/DomainErrors.js'

const invalidIntegers: unknown[] = [0, -1, 1.5, '2', '', null, undefined, NaN, Infinity, true, {}, []]

describe('table model validation', () => {
    it('acepta exactamente los tres estados', () => {
        expect([...TABLE_STATUSES]).toEqual(['libre', 'ocupada', 'reservada'])
        for (const status of TABLE_STATUSES) expect(parseTableStatus(status)).toBe(status)
    })

    it.each(['cerrada', 'LIBRE', ' libre', '', null, undefined, 1, {}])('rechaza el estado %j', value => {
        expect(() => parseTableStatus(value)).toThrow(InvalidTableStatusError)
    })

    it('el mensaje de estado coincide con el contrato', () => {
        expect(() => parseTableStatus('cerrada')).toThrow(
            'Invalid table status: cerrada. Must be one of: libre, ocupada, reservada'
        )
    })

    it.each(invalidIntegers)('rechaza el numero %j', value => {
        expect(() => parseTableNumber(value)).toThrow(InvalidTableNumberError)
    })

    it.each(invalidIntegers)('rechaza la capacidad %j', value => {
        expect(() => parseTableCapacity(value)).toThrow(InvalidTableCapacityError)
    })

    it('acepta enteros positivos sin limite maximo', () => {
        expect(parseTableNumber(1)).toBe(1)
        expect(parseTableCapacity(1_000_000)).toBe(1_000_000)
    })

    it('admite descripcion vacia y rechaza no textos', () => {
        expect(parseTableDescription('')).toBe('')
        for (const value of [null, undefined, 3, {}, []]) {
            expect(() => parseTableDescription(value)).toThrow(InvalidTableDescriptionError)
        }
    })

    describe('parseCreateTableInput', () => {
        it('aplica valores por defecto: descripcion vacia y estado libre', () => {
            expect(parseCreateTableInput({ number: 1, capacity: 4 })).toEqual({
                number: 1, description: '', capacity: 4, status: 'libre'
            })
        })

        it('conserva descripcion y estado indicados', () => {
            expect(parseCreateTableInput({ number: 2, description: 'Barra', capacity: 6, status: 'reservada' })).toEqual({
                number: 2, description: 'Barra', capacity: 6, status: 'reservada'
            })
        })

        it('rechaza campos obligatorios ausentes y cuerpo no objeto', () => {
            expect(() => parseCreateTableInput({ capacity: 4 })).toThrow(InvalidTableNumberError)
            expect(() => parseCreateTableInput({ number: 1 })).toThrow(InvalidTableCapacityError)
            expect(() => parseCreateTableInput(null)).toThrow(InvalidTableNumberError)
            expect(() => parseCreateTableInput(undefined)).toThrow(InvalidTableNumberError)
        })

        it('rechaza estado y descripcion invalidos si se envian', () => {
            expect(() => parseCreateTableInput({ number: 1, capacity: 1, status: null })).toThrow(InvalidTableStatusError)
            expect(() => parseCreateTableInput({ number: 1, capacity: 1, description: null })).toThrow(InvalidTableDescriptionError)
        })

        it('ignora id y restaurantId del cuerpo', () => {
            const result = parseCreateTableInput({ id: 'x', restaurantId: 'y', number: 1, capacity: 1 })
            expect(result).toEqual({ number: 1, description: '', capacity: 1, status: 'libre' })
        })
    })

    describe('parseReplaceTableInput', () => {
        it('requiere los cuatro campos', () => {
            const valid = { number: 1, description: '', capacity: 2, status: 'libre' }
            expect(parseReplaceTableInput(valid)).toEqual(valid)
            expect(() => parseReplaceTableInput({ ...valid, number: undefined })).toThrow(InvalidTableNumberError)
            expect(() => parseReplaceTableInput({ ...valid, description: undefined })).toThrow(InvalidTableDescriptionError)
            expect(() => parseReplaceTableInput({ ...valid, capacity: undefined })).toThrow(InvalidTableCapacityError)
            expect(() => parseReplaceTableInput({ ...valid, status: undefined })).toThrow(InvalidTableStatusError)
        })

        it('ignora id y restaurantId del cuerpo', () => {
            const result = parseReplaceTableInput({ id: 'x', restaurantId: 'y', number: 1, description: 'd', capacity: 2, status: 'ocupada' })
            expect(result).toEqual({ number: 1, description: 'd', capacity: 2, status: 'ocupada' })
        })
    })
})
