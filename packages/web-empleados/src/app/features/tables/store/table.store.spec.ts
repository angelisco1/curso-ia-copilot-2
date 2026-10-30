import { TestBed } from '@angular/core/testing'
import { Subject, throwError, of } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Order } from '../../orders/models/order.model'
import type { Table } from '../models/table.model'
import { TableService } from '../services/table.service'
import { TableStore } from './table.store'

const mk = (id: string, restaurantId = 'r1', status: Table['status'] = 'libre', activeSessionId: string | null = null): Table => ({
  id, restaurantId, number: Number(id.replace(/\D/g, '') || 1), description: '', capacity: 4, status, activeSessionId
})
const order = (id: string, sessionId: string): Order => ({
  id, restaurantId: 'r1', tableId: 't1', clientId: null, createdAt: '', items: [], tableSessionId: sessionId
})

describe('TableStore', () => {
  let store: TableStore
  let tablesCalls: { restaurantId: string; res: Subject<Table[]> }[]
  let detailCalls: { tableId: string; res: Subject<Order[]> }[]
  let service: { getTables: any; updateStatus: any; getCurrentOrders: any }

  beforeEach(() => {
    vi.useFakeTimers()
    tablesCalls = []
    detailCalls = []
    service = {
      getTables: vi.fn((restaurantId: string) => {
        const res = new Subject<Table[]>()
        tablesCalls.push({ restaurantId, res })
        return res.asObservable()
      }),
      updateStatus: vi.fn(),
      getCurrentOrders: vi.fn((_r: string, tableId: string) => {
        const res = new Subject<Order[]>()
        detailCalls.push({ tableId, res })
        return res.asObservable()
      })
    }
    TestBed.configureTestingModule({ providers: [TableStore, { provide: TableService, useValue: service }] })
    store = TestBed.inject(TableStore)
  })

  afterEach(() => {
    store.stopPolling()
    vi.useRealTimers()
    TestBed.resetTestingModule()
  })

  const flush = () => vi.advanceTimersByTimeAsync(0)

  it('carga al iniciar y refresca cada 30 s con un único intervalo', async () => {
    store.startPolling('r1')
    expect(service.getTables).toHaveBeenCalledTimes(1)
    expect(store.loading()).toBe(true)
    tablesCalls[0].res.next([mk('t1')]); tablesCalls[0].res.complete()
    await flush()
    expect(store.tables().map(t => t.id)).toEqual(['t1'])
    expect(store.loading()).toBe(false)

    store.startPolling('r1') // reinicio: no duplica intervalos
    await vi.advanceTimersByTimeAsync(30000)
    expect(service.getTables).toHaveBeenCalledTimes(3) // 1 inicial + 1 reinicio + 1 tick
    await vi.advanceTimersByTimeAsync(30000)
    expect(service.getTables).toHaveBeenCalledTimes(4)
  })

  it('stopPolling detiene el refresco', async () => {
    store.startPolling('r1')
    store.stopPolling()
    await vi.advanceTimersByTimeAsync(90000)
    expect(service.getTables).toHaveBeenCalledTimes(1)
  })

  it('descarta la respuesta tardía de un restaurante anterior', async () => {
    store.startPolling('r1')
    store.startPolling('r2')
    tablesCalls[1].res.next([mk('b1', 'r2')])
    await flush()
    tablesCalls[0].res.next([mk('a1', 'r1')]) // tardía
    await flush()
    expect(store.tables().map(t => t.id)).toEqual(['b1'])
    expect(store.loading()).toBe(false)
  })

  it('muestra el error y conserva las mesas previas sin falso vacío', async () => {
    store.startPolling('r1')
    tablesCalls[0].res.next([mk('t1')])
    await flush()
    service.getTables.mockReturnValueOnce(throwError(() => ({ error: { message: 'caído' } })))
    await store.loadTables()
    expect(store.error()).toBe('caído')
    expect(store.tables()).toHaveLength(1)
  })

  describe('cambio de estado', () => {
    beforeEach(async () => {
      store.startPolling('r1')
      tablesCalls[0].res.next([mk('t1', 'r1', 'ocupada', 's1')])
      await flush()
    })

    it('no actualiza antes del éxito y bloquea el doble envío', async () => {
      const res = new Subject<Table>()
      service.updateStatus.mockReturnValue(res.asObservable())
      const t = store.tables()[0]
      const p1 = store.changeStatus(t, 'libre')
      const p2 = store.changeStatus(t, 'libre')
      expect(await p2).toBe(false)
      expect(service.updateStatus).toHaveBeenCalledTimes(1)
      expect(service.updateStatus).toHaveBeenCalledWith('r1', 't1', { status: 'libre' })
      expect(store.updatingIds().has('t1')).toBe(true)
      expect(store.tables()[0].status).toBe('ocupada')
      res.next(mk('t1', 'r1', 'libre', null)); res.complete()
      expect(await p1).toBe(true)
      expect(store.tables()[0].status).toBe('libre')
      expect(store.updatingIds().has('t1')).toBe(false)
    })

    it('en fallo muestra el mensaje del servidor y mantiene el estado', async () => {
      service.updateStatus.mockReturnValue(throwError(() => ({ error: { message: 'Conflicto' } })))
      expect(await store.changeStatus(store.tables()[0], 'reservada')).toBe(false)
      expect(store.statusError()).toBe('Conflicto')
      expect(store.tables()[0].status).toBe('ocupada')
      expect(store.updatingIds().has('t1')).toBe(false)
    })

    it('ignora el resultado de un cambio si cambió el restaurante', async () => {
      const res = new Subject<Table>()
      service.updateStatus.mockReturnValue(res.asObservable())
      const p = store.changeStatus(store.tables()[0], 'libre')
      store.startPolling('r2')
      res.next(mk('t1', 'r1', 'libre')); res.complete()
      expect(await p).toBe(false)
      expect(store.tables()).toEqual([])
    })
  })

  describe('detalle de visita', () => {
    beforeEach(async () => {
      store.startPolling('r1')
      tablesCalls[0].res.next([mk('t1', 'r1', 'ocupada', 's1'), mk('t2', 'r1', 'ocupada', 's2')])
      await flush()
    })

    it('carga el detalle de la mesa seleccionada', async () => {
      store.selectTable(store.tables()[0])
      expect(store.detailLoading()).toBe(true)
      detailCalls[0].res.next([order('o1', 's1')])
      await flush()
      expect(store.detailOrders().map(o => o.id)).toEqual(['o1'])
      expect(store.detailLoading()).toBe(false)
    })

    it('descarta la respuesta tardía al cambiar de mesa y borra el detalle anterior', async () => {
      store.selectTable(store.tables()[0])
      detailCalls[0].res.next([order('o1', 's1')])
      await flush()
      store.selectTable(store.tables()[1])
      expect(store.detailOrders()).toEqual([])
      detailCalls[1].res.next([order('o2', 's2')])
      await flush()
      expect(store.detailOrders().map(o => o.id)).toEqual(['o2'])
    })

    it('descarta la respuesta tardía de la primera mesa tras seleccionar otra', async () => {
      store.selectTable(store.tables()[0])
      store.selectTable(store.tables()[1])
      detailCalls[1].res.next([order('o2', 's2')])
      await flush()
      detailCalls[0].res.next([order('o1', 's1')])
      await flush()
      expect(store.detailOrders().map(o => o.id)).toEqual(['o2'])
    })

    it('si la sesión cambia en el refresco, borra el detalle viejo y descarta su respuesta', async () => {
      store.selectTable(store.tables()[0])
      detailCalls[0].res.next([order('o1', 's1')])
      await flush()
      await vi.advanceTimersByTimeAsync(30000)
      tablesCalls[1].res.next([mk('t1', 'r1', 'ocupada', 's9'), mk('t2', 'r1', 'ocupada', 's2')])
      await flush()
      expect(store.detailOrders()).toEqual([]) // la visita anterior no se muestra
      const late = detailCalls.length - 1
      detailCalls[late].res.next([order('o9', 's9')])
      await flush()
      expect(store.detailOrders().map(o => o.id)).toEqual(['o9'])
    })

    it('en dos peticiones de la misma mesa solo vale la última', async () => {
      store.selectTable(store.tables()[0])
      await vi.advanceTimersByTimeAsync(30000)
      tablesCalls[1].res.next([mk('t1', 'r1', 'ocupada', 's1'), mk('t2', 'r1', 'ocupada', 's2')])
      await flush()
      expect(detailCalls).toHaveLength(2)
      detailCalls[1].res.next([order('nuevo', 's1')])
      await flush()
      detailCalls[0].res.next([order('viejo', 's1')])
      await flush()
      expect(store.detailOrders().map(o => o.id)).toEqual(['nuevo'])
    })

    it('al liberar la mesa limpia el detalle y no consulta pedidos', async () => {
      store.selectTable(store.tables()[0])
      detailCalls[0].res.next([order('o1', 's1')])
      await flush()
      service.updateStatus.mockReturnValue(of(mk('t1', 'r1', 'libre', null)))
      await store.changeStatus(store.tables()[0], 'libre')
      expect(store.detailOrders()).toEqual([])
      expect(detailCalls).toHaveLength(1)
    })

    it('error de detalle visible', async () => {
      store.selectTable(store.tables()[0])
      detailCalls[0].res.error({ error: { message: 'fallo detalle' } })
      await flush()
      expect(store.detailError()).toBe('fallo detalle')
    })
  })
})
