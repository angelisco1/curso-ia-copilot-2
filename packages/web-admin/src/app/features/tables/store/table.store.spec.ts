import { TestBed } from '@angular/core/testing'
import { of, Subject, throwError } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RestaurantTable } from '../models/table.model'
import { TableService } from '../services/table.service'
import { TableStore } from './table.store'

const createTable = (id: string, restaurantId: string, number = 1): RestaurantTable => ({
  id,
  restaurantId,
  number,
  description: '',
  capacity: 4,
  status: 'libre',
  activeSessionId: null
})

describe('TableStore', () => {
  let store: TableStore
  let pending: Subject<RestaurantTable[]>[]
  let service: {
    getAll: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    pending = []
    service = {
      getAll: vi.fn(() => {
        const response = new Subject<RestaurantTable[]>()
        pending.push(response)
        return response.asObservable()
      }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }
    TestBed.configureTestingModule({
      providers: [TableStore, { provide: TableService, useValue: service }]
    })
    store = TestBed.inject(TableStore)
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  const loadWith = async (restaurantId: string, tables: RestaurantTable[]) => {
    const load = store.loadByRestaurant(restaurantId)
    const response = pending[pending.length - 1]
    response.next(tables)
    response.complete()
    await load
  }

  it('exposes loading while the request is pending and data afterwards', async () => {
    const load = store.loadByRestaurant('rest-1')
    expect(store.loading()).toBe(true)
    expect(store.error()).toBeNull()

    pending[0].next([createTable('t1', 'rest-1')])
    pending[0].complete()
    await load

    expect(store.loading()).toBe(false)
    expect(store.tables().map(t => t.id)).toEqual(['t1'])
  })

  it('sets an error message and keeps the list empty when loading fails', async () => {
    const load = store.loadByRestaurant('rest-1')
    pending[0].error(new Error('network'))
    await load

    expect(store.error()).toBe('No se pudieron cargar las mesas.')
    expect(store.tables()).toEqual([])
    expect(store.loading()).toBe(false)
  })

  it('clears restaurant A on switching to B and ignores late A responses (data, error, loading)', async () => {
    const loadA = store.loadByRestaurant('rest-A')
    const loadB = store.loadByRestaurant('rest-B')

    expect(store.tables()).toEqual([])

    pending[0].next([createTable('a1', 'rest-A')])
    pending[0].complete()
    await loadA
    expect(store.tables()).toEqual([])
    expect(store.loading()).toBe(true)

    pending[1].next([createTable('b1', 'rest-B')])
    pending[1].complete()
    await loadB
    expect(store.tables().map(t => t.id)).toEqual(['b1'])
    expect(store.loading()).toBe(false)
    expect(store.error()).toBeNull()
  })

  it('ignores a late failure of A after B has loaded', async () => {
    const loadA = store.loadByRestaurant('rest-A')
    const loadB = store.loadByRestaurant('rest-B')
    pending[1].next([createTable('b1', 'rest-B')])
    pending[1].complete()
    await loadB

    pending[0].error(new Error('late'))
    await loadA

    expect(store.error()).toBeNull()
    expect(store.tables().map(t => t.id)).toEqual(['b1'])
    expect(store.loading()).toBe(false)
  })

  it('adds the created table keeping the list ordered by number', async () => {
    await loadWith('rest-1', [createTable('t1', 'rest-1', 1), createTable('t3', 'rest-1', 3)])
    service.create.mockReturnValue(of(createTable('t2', 'rest-1', 2)))

    await store.create('rest-1', { number: 2, capacity: 4 })

    expect(service.create).toHaveBeenCalledWith('rest-1', { number: 2, capacity: 4 })
    expect(store.tables().map(t => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('replaces the updated table by id', async () => {
    await loadWith('rest-1', [createTable('t1', 'rest-1', 1)])
    const updated = { ...createTable('t1', 'rest-1', 1), capacity: 8, status: 'reservada' as const }
    service.update.mockReturnValue(of(updated))

    await store.update('rest-1', 't1', { number: 1, description: '', capacity: 8, status: 'reservada' })

    expect(store.tables()).toEqual([updated])
  })

  it('removes the deleted table only after the API succeeds', async () => {
    await loadWith('rest-1', [createTable('t1', 'rest-1'), createTable('t2', 'rest-1', 2)])
    service.delete.mockReturnValue(of(undefined))

    await store.delete('rest-1', 't1')

    expect(store.tables().map(t => t.id)).toEqual(['t2'])
  })

  it('keeps the list and rethrows when a mutation fails', async () => {
    await loadWith('rest-1', [createTable('t1', 'rest-1')])
    const failure = { status: 409, error: { message: 'dup' } }
    service.delete.mockReturnValue(throwError(() => failure))
    service.create.mockReturnValue(throwError(() => failure))
    service.update.mockReturnValue(throwError(() => failure))

    await expect(store.delete('rest-1', 't1')).rejects.toBe(failure)
    await expect(store.create('rest-1', { number: 1, capacity: 2 })).rejects.toBe(failure)
    await expect(store.update('rest-1', 't1', { number: 1, description: '', capacity: 2, status: 'libre' })).rejects.toBe(failure)

    expect(store.tables().map(t => t.id)).toEqual(['t1'])
  })

  it('does not apply a mutation result from a restaurant that is no longer the current one', async () => {
    await loadWith('rest-B', [createTable('b1', 'rest-B')])
    service.create.mockReturnValue(of(createTable('a9', 'rest-A', 9)))

    await store.create('rest-A', { number: 9, capacity: 2 })

    expect(store.tables().map(t => t.id)).toEqual(['b1'])
  })
})
