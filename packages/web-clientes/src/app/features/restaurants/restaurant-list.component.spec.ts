import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { of } from 'rxjs'
import { RestaurantListComponent } from './restaurant-list.component'
import { RestaurantService } from '../../core/services/restaurant.service'

describe('RestaurantListComponent', () => {
  it('lleva cada restaurante al paso de selección de mesa, no directamente a la carta', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: RestaurantService,
          useValue: {
            getAll: () => of([{
              id: 'r-1', name: 'Uno', address: 'Calle 1', email: '', phone: '1', ownerFirstName: '', ownerLastName: '',
              logoUrl: 'logo.png', createdAt: '', updatedAt: ''
            }])
          }
        }
      ]
    })
    const fixture = TestBed.createComponent(RestaurantListComponent)
    fixture.detectChanges()

    const link = (fixture.nativeElement as HTMLElement).querySelector('a.restaurant-card')!
    expect(link.getAttribute('href')).toBe('/restaurants/r-1/tables')
  })
})
