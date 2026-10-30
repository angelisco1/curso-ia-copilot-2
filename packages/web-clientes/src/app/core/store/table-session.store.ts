import { Injectable, computed, inject, signal } from '@angular/core'
import { AuthStore } from '@resttek/web-shared'
import { Observable, catchError, defer, map, of, tap } from 'rxjs'
import { TableService } from '../services/table.service'
import { TableOccupation } from '../models/table.model'
import { describeTableError, parseApiError } from '../models/api-error'

/**
 * Contexto de ocupación del cliente. El servidor es la autoridad: el estado
 * solo vive en memoria y se reconstruye con `load()`; nunca se persiste ni se
 * libera desde aquí (salir o cambiar de restaurante no cierra la ocupación).
 */
@Injectable({ providedIn: 'root' })
export class TableSessionStore {
  private readonly tables = inject(TableService)
  private readonly auth = inject(AuthStore)

  private readonly _stored = signal<{ userId: string | null; occupation: TableOccupation } | null>(null)
  private readonly _loading = signal(false)
  private readonly _error = signal<string | null>(null)
  private seq = 0

  /** Ocupación vigente; se oculta si cambia el usuario autenticado. */
  readonly occupation = computed<TableOccupation | null>(() => {
    const stored = this._stored()
    return stored && stored.userId === (this.auth.user()?.id ?? null) ? stored.occupation : null
  })
  readonly loading = this._loading.asReadonly()
  readonly error = this._error.asReadonly()
  readonly session = computed(() => this.occupation()?.session ?? null)
  readonly table = computed(() => this.occupation()?.table ?? null)
  readonly sessionId = computed(() => this.session()?.id ?? null)
  readonly partySize = computed(() => this.session()?.partySize ?? null)

  occupationFor(restaurantId: string): TableOccupation | null {
    const occupation = this.occupation()
    return occupation && occupation.session.restaurantId === restaurantId ? occupation : null
  }

  /** Reconstruye la ocupación de un restaurante desde la API. Solo aplica la última petición. */
  load(restaurantId: string): Observable<TableOccupation | null> {
    return defer(() => {
      const token = ++this.seq
      const current = this.occupation()
      if (current && current.session.restaurantId !== restaurantId) this._stored.set(null)
      this._loading.set(true)
      this._error.set(null)

      return this.tables.getCurrent(restaurantId).pipe(
        tap({
          next: occupation => {
            if (token !== this.seq) return
            this.setStored(occupation)
            this._loading.set(false)
          },
          error: err => {
            if (token !== this.seq) return
            this._stored.set(null)
            this._error.set(describeTableError(
              parseApiError(err),
              'No se pudo comprobar tu mesa. Inténtalo de nuevo.'
            ))
            this._loading.set(false)
          }
        })
      )
    })
  }

  /**
   * Comprueba en el servidor si la sesión indicada sigue vigente.
   * 'closed' = ya no hay ocupación o es otra; 'unknown' = no se pudo comprobar (el servidor validará al enviar).
   */
  revalidate(restaurantId: string, sessionId: string): Observable<'valid' | 'closed' | 'unknown'> {
    return this.load(restaurantId).pipe(
      map(occupation => (occupation && occupation.session.id === sessionId ? 'valid' : 'closed') as 'valid' | 'closed'),
      catchError(() => of('unknown' as const))
    )
  }

  /** Guarda la ocupación confirmada por el servidor. */
  setOccupation(occupation: TableOccupation): void {
    this.seq++
    this.setStored(occupation)
    this._loading.set(false)
    this._error.set(null)
  }

  /** Olvida el contexto local. No contacta con el servidor ni libera la mesa. */
  clear(): void {
    this.seq++
    this._stored.set(null)
    this._loading.set(false)
    this._error.set(null)
  }

  private setStored(occupation: TableOccupation | null): void {
    this._stored.set(occupation ? { userId: this.auth.user()?.id ?? null, occupation } : null)
  }
}
