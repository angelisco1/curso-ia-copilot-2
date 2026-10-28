import { TestBed } from '@angular/core/testing'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Dish } from '../models/dish.model'
import { DishService } from '../services/dish.service'
import { DishStore } from './dish.store'

const createDish = (id: string, restaurantId: string): Dish => ({
  id,
  name: `Dish ${id}`,
  description: null,
  price: 10,
  category: 'principal',
  available: true,
  restaurantId,
  ingredients: [],
  createdAt: '',
  updatedAt: ''
})

describe('DishStore', () => {
  let store: DishStore
  let pendingResponses: Subject<Dish[]>[]
  let service: { getAll: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    pendingResponses = []
    service = {
      getAll: vi.fn(() => {
        const response = new Subject<Dish[]>()
        pendingResponses.push(response)
        return response.asObservable()
      })
    }

    TestBed.configureTestingModule({
      providers: [
        DishStore,
        { provide: DishService, useValue: service }
      ]
    })
    store = TestBed.inject(DishStore)
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('only lets the latest A-B-A load change data, error, and loading', async () => {
    const firstLoad = store.loadByRestaurant('rest-1')
    const secondLoad = store.loadByRestaurant('rest-2')
    const latestLoad = store.loadByRestaurant('rest-1')

    pendingResponses[0].next([createDish('stale', 'rest-1')])
    pendingResponses[0].complete()
    await firstLoad

    expect(store.dishes()).toEqual([])
    expect(store.error()).toBeNull()
    expect(store.loading()).toBe(true)

    pendingResponses[1].error(new Error('stale failure'))
    await secondLoad

    expect(store.dishes()).toEqual([])
    expect(store.error()).toBeNull()
    expect(store.loading()).toBe(true)

    const latestDish = createDish('latest', 'rest-1')
    pendingResponses[2].next([latestDish])
    pendingResponses[2].complete()
    await latestLoad

    expect(store.dishes()).toEqual([latestDish])
    expect(store.error()).toBeNull()
    expect(store.loading()).toBe(false)
  })

  it('ignores a stale error that arrives after the latest load succeeds', async () => {
    const staleLoad = store.loadByRestaurant('rest-1')
    const latestLoad = store.loadByRestaurant('rest-2')
    const latestDish = createDish('latest', 'rest-2')

    pendingResponses[1].next([latestDish])
    pendingResponses[1].complete()
    await latestLoad

    pendingResponses[0].error(new Error('stale failure'))
    await staleLoad

    expect(store.dishes()).toEqual([latestDish])
    expect(store.error()).toBeNull()
    expect(store.loading()).toBe(false)
  })

  it('clears previous dishes and keeps the existing error for the current load', async () => {
    const initialLoad = store.loadByRestaurant('rest-1')
    const previousDish = createDish('previous', 'rest-1')
    pendingResponses[0].next([previousDish])
    pendingResponses[0].complete()
    await initialLoad

    const currentLoad = store.loadByRestaurant('rest-2')
    expect(store.dishes()).toEqual([])
    expect(store.loading()).toBe(true)

    pendingResponses[1].error(new Error('current failure'))
    await currentLoad

    expect(store.dishes()).toEqual([])
    expect(store.error()).toBe('No se pudieron cargar los platos.')
    expect(store.loading()).toBe(false)
  })
})
