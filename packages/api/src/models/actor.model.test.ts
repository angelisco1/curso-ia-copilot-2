import { describe, it, expect } from 'vitest'
import { toActor } from './actor.model.js'
import { InvalidActorError } from '@errors/DomainErrors.js'

describe('toActor', () => {
    it('convierte las claims del JWT', () => {
        expect(toActor({ id: 'u1', role: 'camarero', restaurantId: 'r1', iat: 1 })).toEqual({ id: 'u1', role: 'camarero', restaurantId: 'r1' })
        expect(toActor({ id: 'a1', role: 'admin', restaurantId: null })).toEqual({ id: 'a1', role: 'admin', restaurantId: null })
        expect(toActor({ id: 'c1', role: 'cliente' })).toEqual({ id: 'c1', role: 'cliente', restaurantId: null })
    })

    it.each([undefined, null, 'x', {}, { id: 'u' }, { role: 'admin' }, { id: '', role: 'admin' }, { id: 1, role: 'admin' }, { id: 'u', role: 'root' }])(
        'rechaza claims invalidas %j', claims => {
            expect(() => toActor(claims)).toThrow(InvalidActorError)
        })
})
