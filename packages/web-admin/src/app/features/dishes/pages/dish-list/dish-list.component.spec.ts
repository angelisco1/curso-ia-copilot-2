import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, type ParamMap } from '@angular/router'
import { BehaviorSubject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Dish } from '../../models/dish.model'
import { DishStore } from '../../store/dish.store'
import { DishListComponent } from './dish-list.component'

describe('DishListComponent', () => {
  let paramMap: BehaviorSubject<ParamMap>
  let loadByRestaurant: ReturnType<typeof vi.fn>
  let deleteDish: ReturnType<typeof vi.fn>
  let updateDish: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    paramMap = new BehaviorSubject(convertToParamMap({ restaurantId: 'rest-1' }))
    loadByRestaurant = vi.fn()
    deleteDish = vi.fn()
    updateDish = vi.fn()

    TestBed.configureTestingModule({
      imports: [DishListComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            parent: {
              snapshot: { params: { restaurantId: 'rest-1' } },
              paramMap
            }
          }
        },
        {
          provide: DishStore,
          useValue: {
            loadByRestaurant,
            delete: deleteDish,
            update: updateDish
          }
        }
      ]
    })
    TestBed.overrideComponent(DishListComponent, { set: { template: '' } })
    await TestBed.compileComponents()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    TestBed.resetTestingModule()
  })

  it('loads once per distinct restaurant and tracks the current id', () => {
    const fixture = TestBed.createComponent(DishListComponent)
    fixture.detectChanges()

    expect(loadByRestaurant).toHaveBeenCalledTimes(1)
    expect(loadByRestaurant).toHaveBeenNthCalledWith(1, 'rest-1')

    paramMap.next(convertToParamMap({ restaurantId: 'rest-1' }))
    paramMap.next(convertToParamMap({ restaurantId: 'rest-2' }))
    paramMap.next(convertToParamMap({ restaurantId: 'rest-1' }))

    expect(loadByRestaurant).toHaveBeenCalledTimes(3)
    expect(loadByRestaurant).toHaveBeenNthCalledWith(2, 'rest-2')
    expect(loadByRestaurant).toHaveBeenNthCalledWith(3, 'rest-1')
    expect(fixture.componentInstance.restaurantId).toBe('rest-1')

    fixture.destroy()
  })

  it('uses the current restaurant when deleting a dish', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const fixture = TestBed.createComponent(DishListComponent)
    fixture.detectChanges()

    paramMap.next(convertToParamMap({ restaurantId: 'rest-2' }))
    await fixture.componentInstance.onDelete('dish-1')

    expect(deleteDish).toHaveBeenCalledWith('rest-2', 'dish-1')
    fixture.destroy()
  })

  it('uses the current restaurant when toggling availability', async () => {
    const fixture = TestBed.createComponent(DishListComponent)
    fixture.detectChanges()
    const dish: Dish = {
      id: 'dish-1',
      name: 'Plato de prueba',
      description: null,
      price: 12.5,
      category: 'principal',
      available: false,
      restaurantId: 'rest-2',
      ingredients: [],
      createdAt: '',
      updatedAt: ''
    }

    paramMap.next(convertToParamMap({ restaurantId: 'rest-2' }))
    await fixture.componentInstance.onToggleAvailable(dish.id, dish)

    expect(updateDish).toHaveBeenCalledWith('rest-2', 'dish-1', {
      ...dish,
      available: true
    })
    fixture.destroy()
  })

  it('stops observing route parameters when destroyed', () => {
    const fixture = TestBed.createComponent(DishListComponent)
    fixture.detectChanges()
    fixture.destroy()

    paramMap.next(convertToParamMap({ restaurantId: 'rest-2' }))

    expect(loadByRestaurant).toHaveBeenCalledTimes(1)
  })
})
