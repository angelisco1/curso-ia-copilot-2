import { TestBed } from '@angular/core/testing'

describe('Employee access test setup', () => {
  it('initializes Angular TestBed', async () => {
    await TestBed.configureTestingModule({}).compileComponents()

    expect(TestBed).toBeDefined()
  })
})
