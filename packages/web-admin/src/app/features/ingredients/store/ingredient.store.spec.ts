import { TestBed } from '@angular/core/testing'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ingredient } from '../models/ingredient.model'
import { IngredientService } from '../services/ingredient.service'
import { IngredientStore } from './ingredient.store'

const createIngredient = (id: string, restaurantId: string): Ingredient => ({
  id,
  name: `Ingredient ${id}`,
  unit: 'kg',
  currentStock: 1,
  restaurantId,
  createdAt: '',
  updatedAt: ''
})

describe('IngredientStore', () => {
  let store: IngredientStore
  let pendingResponses: Subject<Ingredient[]>[]
  let service: { getAll: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    pendingResponses = []
    service = {
      getAll: vi.fn(() => {
        const response = new Subject<Ingredient[]>()
        pendingResponses.push(response)
        return response.asObservable()
      })
    }

    TestBed.configureTestingModule({
      providers: [
        IngredientStore,
        { provide: IngredientService, useValue: service }
      ]
    })
    store = TestBed.inject(IngredientStore)
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('only lets the latest A-B-A load change data, error, and loading', async () => {
    const firstLoad = store.loadByRestaurant('rest-1')
    const secondLoad = store.loadByRestaurant('rest-2')
    const latestLoad = store.loadByRestaurant('rest-1')

    pendingResponses[0].next([createIngredient('stale', 'rest-1')])
    pendingResponses[0].complete()
    await firstLoad

    expect(store.ingredients()).toEqual([])
    expect(store.error()).toBeNull()
    expect(store.loading()).toBe(true)

    pendingResponses[1].error(new Error('stale failure'))
    await secondLoad

    expect(store.ingredients()).toEqual([])
    expect(store.error()).toBeNull()
    expect(store.loading()).toBe(true)

    const latestIngredient = createIngredient('latest', 'rest-1')
    pendingResponses[2].next([latestIngredient])
    pendingResponses[2].complete()
    await latestLoad

    expect(store.ingredients()).toEqual([latestIngredient])
    expect(store.error()).toBeNull()
    expect(store.loading()).toBe(false)
  })

  it('ignores a stale error that arrives after the latest load succeeds', async () => {
    const staleLoad = store.loadByRestaurant('rest-1')
    const latestLoad = store.loadByRestaurant('rest-2')
    const latestIngredient = createIngredient('latest', 'rest-2')

    pendingResponses[1].next([latestIngredient])
    pendingResponses[1].complete()
    await latestLoad

    pendingResponses[0].error(new Error('stale failure'))
    await staleLoad

    expect(store.ingredients()).toEqual([latestIngredient])
    expect(store.error()).toBeNull()
    expect(store.loading()).toBe(false)
  })

  it('clears previous ingredients and keeps the existing error for the current load', async () => {
    const initialLoad = store.loadByRestaurant('rest-1')
    const previousIngredient = createIngredient('previous', 'rest-1')
    pendingResponses[0].next([previousIngredient])
    pendingResponses[0].complete()
    await initialLoad

    const currentLoad = store.loadByRestaurant('rest-2')
    expect(store.ingredients()).toEqual([])
    expect(store.loading()).toBe(true)

    pendingResponses[1].error(new Error('current failure'))
    await currentLoad

    expect(store.ingredients()).toEqual([])
    expect(store.error()).toBe('No se pudieron cargar los ingredientes.')
    expect(store.loading()).toBe(false)
  })
})
