import { InvalidActorError } from '@errors/DomainErrors.js'

export const ACTOR_ROLES = ['admin', 'manager', 'camarero', 'cocinero', 'cliente'] as const
export type ActorRole = typeof ACTOR_ROLES[number]

export interface Actor {
    id: string
    role: ActorRole
    restaurantId: string | null
}

/** Convierte las claims del JWT en un actor tipado; rechaza tokens sin `id` o con `role` desconocido. */
export function toActor(user: unknown): Actor {
    if (typeof user !== 'object' || user === null) throw new InvalidActorError()
    const claims = user as Record<string, unknown>
    if (typeof claims.id !== 'string' || claims.id === '') throw new InvalidActorError()
    if (typeof claims.role !== 'string' || !ACTOR_ROLES.includes(claims.role as ActorRole)) throw new InvalidActorError()
    const restaurantId = typeof claims.restaurantId === 'string' && claims.restaurantId !== '' ? claims.restaurantId : null
    return { id: claims.id, role: claims.role as ActorRole, restaurantId }
}
