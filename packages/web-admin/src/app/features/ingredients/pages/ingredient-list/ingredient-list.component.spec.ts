import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, type ParamMap } from '@angular/router'
import { BehaviorSubject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IngredientStore } from '../../store/ingredient.store'
import { IngredientListComponent } from './ingredient-list.component'

describe('IngredientListComponent', () => {
  let paramMap: BehaviorSubject<ParamMap>
  let loadByRestaurant: ReturnType<typeof vi.fn>
  let deleteIngredient: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    paramMap = new BehaviorSubject(convertToParamMap({ restaurantId: 'rest-1' }))
    loadByRestaurant = vi.fn()
    deleteIngredient = vi.fn()

    TestBed.configureTestingModule({
      imports: [IngredientListComponent],
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
          provide: IngredientStore,
          useValue: {
            loadByRestaurant,
            delete: deleteIngredient
          }
        }
      ]
    })
    TestBed.overrideComponent(IngredientListComponent, { set: { template: '' } })
    await TestBed.compileComponents()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    TestBed.resetTestingModule()
  })

  it('loads once per distinct restaurant and tracks the current id', () => {
    const fixture = TestBed.createComponent(IngredientListComponent)
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

  it('uses the current restaurant when deleting an ingredient', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const fixture = TestBed.createComponent(IngredientListComponent)
    fixture.detectChanges()

    paramMap.next(convertToParamMap({ restaurantId: 'rest-2' }))
    await fixture.componentInstance.onDelete('ingredient-1')

    expect(deleteIngredient).toHaveBeenCalledWith('rest-2', 'ingredient-1')
    fixture.destroy()
  })

  it('stops observing route parameters when destroyed', () => {
    const fixture = TestBed.createComponent(IngredientListComponent)
    fixture.detectChanges()
    fixture.destroy()

    paramMap.next(convertToParamMap({ restaurantId: 'rest-2' }))

    expect(loadByRestaurant).toHaveBeenCalledTimes(1)
  })
})
