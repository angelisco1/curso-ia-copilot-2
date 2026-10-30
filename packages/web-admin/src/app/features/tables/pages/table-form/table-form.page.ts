import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, type ValidationErrors } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { LucideAngularModule } from 'lucide-angular'
import { combineLatest, distinctUntilChanged, firstValueFrom, map, startWith } from 'rxjs'
import { TABLE_STATUSES, type TableStatus } from '../../models/table.model'
import { TableService } from '../../services/table.service'
import { TableStore } from '../../store/table.store'

const positiveInteger = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? null : { positiveInteger: true }
}

@Component({
  selector: 'app-table-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LucideAngularModule],
  templateUrl: './table-form.page.html',
  styleUrl: './table-form.page.css'
})
export class TableFormPage implements OnInit {
  private readonly store = inject(TableStore)
  private readonly service = inject(TableService)
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly fb = inject(NonNullableFormBuilder)

  readonly statuses = TABLE_STATUSES
  readonly statusLabels: Record<TableStatus, string> = {
    libre: 'Libre',
    ocupada: 'Ocupada',
    reservada: 'Reservada'
  }

  readonly restaurantId = signal('')
  readonly tableId = signal<string | null>(null)
  readonly isEditing = computed(() => this.tableId() !== null)
  readonly loading = signal(false)
  readonly loadFailed = signal(false)
  readonly saving = signal(false)
  readonly error = signal<string | null>(null)
  private originalStatus: TableStatus | null = null
  private loadSequence = 0
  private readonly destroyRef = inject(DestroyRef)

  readonly form = this.fb.group({
    number: this.fb.control<number | null>(null, positiveInteger),
    description: this.fb.control(''),
    capacity: this.fb.control<number | null>(null, positiveInteger),
    status: this.fb.control<TableStatus>('libre')
  })

  private readonly formStatus = toSignal(this.form.statusChanges.pipe(startWith(this.form.status)), {
    initialValue: this.form.status
  })
  readonly submitDisabled = computed(
    () => this.formStatus() !== 'VALID' || this.saving() || this.loading() || this.loadFailed()
  )

  readonly pageTitle = computed(() => (this.isEditing() ? 'Editar mesa' : 'Nueva mesa'))
  readonly listUrl = computed(() => `/restaurants/${this.restaurantId()}/tables`)

  ngOnInit(): void {
    // La page se reutiliza al cambiar de restaurante o de mesa: reaccionar a los parámetros.
    combineLatest([
      this.route.parent?.paramMap.pipe(map(p => p.get('restaurantId') ?? '')) ?? [''],
      this.route.paramMap.pipe(map(p => p.get('id')))
    ]).pipe(
      distinctUntilChanged(([r1, t1], [r2, t2]) => r1 === r2 && t1 === t2),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(([restaurantId, tableId]) => {
      this.restaurantId.set(restaurantId)
      this.tableId.set(tableId)
      this.resetState()
      if (restaurantId && tableId) {
        void this.loadTable(restaurantId, tableId)
      }
    })
  }

  private resetState(): void {
    this.loadSequence++
    this.originalStatus = null
    this.error.set(null)
    this.loadFailed.set(false)
    this.loading.set(false)
    this.saving.set(false)
    this.form.reset({ number: null, description: '', capacity: null, status: 'libre' })
  }

  private async loadTable(restaurantId: string, id: string): Promise<void> {
    const sequence = this.loadSequence
    this.loading.set(true)
    try {
      const table = await firstValueFrom(this.service.getById(restaurantId, id))
      if (sequence !== this.loadSequence) return
      this.originalStatus = table.status
      this.form.setValue({
        number: table.number,
        description: table.description,
        capacity: table.capacity,
        status: table.status
      })
    } catch (err) {
      if (sequence !== this.loadSequence) return
      this.loadFailed.set(true)
      this.error.set(this.describeError(err, 'No se pudo cargar la mesa.'))
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false)
    }
  }

  showError(name: 'number' | 'capacity'): boolean {
    const control = this.form.controls[name]
    return control.invalid && (control.dirty || control.touched)
  }

  async onSubmit(): Promise<void> {
    if (this.saving() || this.loading() || this.loadFailed()) return
    this.form.markAllAsTouched()
    if (this.form.invalid) return

    const { number, description, capacity, status } = this.form.getRawValue()
    const restaurantId = this.restaurantId()
    const tableId = this.tableId()
    const sequence = this.loadSequence
    if (tableId !== null && this.originalStatus === 'ocupada' && status !== 'ocupada') {
      const accepted = confirm(
        `Vas a cambiar la mesa de ocupada a ${this.statusLabels[status].toLowerCase()}: se cerrará su ocupación actual. ` +
        'Puede haber pedidos pendientes; no se eliminan ni se cancelan y seguirán en cocina y barra. ¿Continuar?'
      )
      if (!accepted) return
    }

    this.error.set(null)
    this.saving.set(true)
    try {
      const dto = { number: number as number, description, capacity: capacity as number, status }
      if (tableId) {
        await this.store.update(restaurantId, tableId, dto)
      } else {
        await this.store.create(restaurantId, dto)
      }
      if (sequence === this.loadSequence) {
        await this.router.navigateByUrl(`/restaurants/${restaurantId}/tables`)
      }
    } catch (err) {
      if (sequence === this.loadSequence) {
        this.error.set(this.describeError(err, 'No se pudo guardar la mesa. Inténtalo de nuevo.'))
      }
    } finally {
      if (sequence === this.loadSequence) this.saving.set(false)
    }
  }

  private describeError(err: unknown, fallback: string): string {
    const failure = err as { status?: number; error?: { error?: string; message?: string } } | null
    if (failure?.status === 404) {
      return 'La mesa ya no existe o fue borrada. Vuelve al listado para actualizarlo.'
    }
    if (failure?.status === 409) {
      const detail = `${failure.error?.error ?? ''} ${failure.error?.message ?? ''}`.toLowerCase()
      if (detail.includes('capacity')) {
        return 'La capacidad no puede ser menor que el grupo que ocupa la mesa actualmente.'
      }
      if (detail.includes('number') || !this.isEditing()) {
        return 'Ya existe una mesa con ese número en este restaurante.'
      }
      return 'Conflicto al guardar: el número ya existe en este restaurante o la capacidad es menor que el grupo que ocupa la mesa.'
    }
    return fallback
  }
}
