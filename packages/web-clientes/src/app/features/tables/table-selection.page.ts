import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { Subscription } from 'rxjs'
import { TableService } from '../../core/services/table.service'
import { TableSessionStore } from '../../core/store/table-session.store'
import { AvailableTable } from '../../core/models/table.model'
import { describeTableError, parseApiError } from '../../core/models/api-error'

/** Paso previo a la carta: número de personas y elección de una mesa libre. */
@Component({
  selector: 'app-table-selection-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './table-selection.page.html',
  styleUrl: './table-selection.page.css'
})
export class TableSelectionPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly tableService = inject(TableService)
  readonly sessionStore = inject(TableSessionStore)

  readonly restaurantId = signal('')
  readonly partyInput = signal('')
  readonly tables = signal<AvailableTable[] | null>(null)
  readonly searching = signal(false)
  readonly searchError = signal<string | null>(null)
  readonly selectedTableId = signal<string | null>(null)
  readonly saving = signal(false)
  readonly actionError = signal<string | null>(null)
  /** Aviso recibido al volver aquí desde otra pantalla (p. ej. mesa liberada al enviar el pedido). */
  readonly notice = signal<string | null>(null)
  /** Grupo válido (entero positivo) o null. */
  readonly partySize = computed<number | null>(() => {
    const raw = this.partyInput().trim()
    if (!/^\d+$/.test(raw)) return null
    const value = Number(raw)
    return Number.isSafeInteger(value) && value > 0 ? value : null
  })
  readonly partyInvalid = computed(() => this.partyInput().trim() !== '' && this.partySize() === null)
  readonly existing = computed(() => this.sessionStore.occupationFor(this.restaurantId()))
  readonly selectedTable = computed(() =>
    this.tables()?.find(t => t.id === this.selectedTableId()) ?? null
  )

  private searchSeq = 0
  private searchSub: Subscription | null = null

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? ''
    this.restaurantId.set(id)
    const notice = (typeof history !== 'undefined' ? history.state : null)?.notice
    if (typeof notice === 'string' && notice) this.notice.set(notice)
    this.sessionStore.load(id).subscribe({ error: () => {} })
  }

  ngOnDestroy(): void {
    this.cancelSearch()
  }

  onPartyInput(value: string): void {
    this.partyInput.set(value)
    this.actionError.set(null)
    this.invalidateResults()
  }

  search(): void {
    const size = this.partySize()
    if (size === null || this.searching()) return
    this.invalidateResults()
    const token = this.searchSeq
    this.searching.set(true)
    this.searchSub = this.tableService.getAvailable(this.restaurantId(), size).subscribe({
      next: list => {
        if (token !== this.searchSeq) return
        this.tables.set(list)
        this.searching.set(false)
      },
      error: err => {
        if (token !== this.searchSeq) return
        this.searchError.set(describeTableError(
          parseApiError(err),
          'No se pudieron cargar las mesas. Inténtalo de nuevo.'
        ))
        this.searching.set(false)
      }
    })
  }

  /** Seleccionar solo marca la elección en pantalla: no ocupa nada en el servidor. */
  select(table: AvailableTable): void {
    this.actionError.set(null)
    this.selectedTableId.set(table.id)
  }

  /** Confirma en servidor la mesa elegida y, si tiene éxito (201/200), continúa a la carta. */
  confirm(): void {
    const tableId = this.selectedTableId()
    const size = this.partySize()
    if (this.saving() || tableId === null || size === null) return

    this.saving.set(true)
    this.actionError.set(null)
    this.tableService.confirmOccupation(this.restaurantId(), tableId, size).subscribe({
      next: occupation => {
        this.sessionStore.setOccupation(occupation)
        this.saving.set(false)
        void this.router.navigate(['/restaurants', this.restaurantId()])
      },
      error: err => {
        this.saving.set(false)
        const parsed = parseApiError(err)
        this.actionError.set(describeTableError(
          parsed,
          'No se pudo confirmar la mesa. Inténtalo de nuevo.'
        ))
        if (parsed.status === 409) this.reconcileAfterConflict(size)
      }
    })
  }

  /** Tras un 409 consulta la ocupación real; sin sesión propia, refresca la lista sin elegir mesa. */
  private reconcileAfterConflict(size: number): void {
    this.selectedTableId.set(null)
    this.sessionStore.load(this.restaurantId()).subscribe({
      next: occupation => {
        if (!occupation && this.partySize() === size) this.search()
      },
      error: () => {
        if (this.partySize() === size) this.search()
      }
    })
  }

  /** Cambia el grupo o repite la búsqueda: descarta lista, selección y respuestas en vuelo. */
  private invalidateResults(): void {
    this.cancelSearch()
    this.tables.set(null)
    this.selectedTableId.set(null)
    this.searchError.set(null)
    this.searching.set(false)
  }

  private cancelSearch(): void {
    this.searchSeq++
    this.searchSub?.unsubscribe()
    this.searchSub = null
  }
}
