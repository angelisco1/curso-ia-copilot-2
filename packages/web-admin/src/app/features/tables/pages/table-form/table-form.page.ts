import { Component, computed, inject, OnInit, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, type ValidationErrors } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { LucideAngularModule } from 'lucide-angular'
import { firstValueFrom, startWith } from 'rxjs'
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

  readonly restaurantId = this.route.parent?.snapshot.params['restaurantId'] ?? ''
  readonly tableId = this.route.snapshot.paramMap.get('id')
  readonly isEditing = this.tableId !== null
  readonly loading = signal(false)
  readonly loadFailed = signal(false)
  readonly saving = signal(false)
  readonly error = signal<string | null>(null)
  private originalStatus: TableStatus | null = null

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

  readonly pageTitle = this.isEditing ? 'Editar mesa' : 'Nueva mesa'
  readonly listUrl = `/restaurants/${this.restaurantId}/tables`

  ngOnInit(): void {
    if (this.tableId) {
      void this.loadTable(this.tableId)
    }
  }

  private async loadTable(id: string): Promise<void> {
    this.loading.set(true)
    this.error.set(null)
    try {
      const table = await firstValueFrom(this.service.getById(this.restaurantId, id))
      this.originalStatus = table.status
      this.form.setValue({
        number: table.number,
        description: table.description,
        capacity: table.capacity,
        status: table.status
      })
    } catch (err) {
      this.loadFailed.set(true)
      this.error.set(this.describeError(err, 'No se pudo cargar la mesa.'))
    } finally {
      this.loading.set(false)
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
    if (this.isEditing && this.originalStatus === 'ocupada' && status !== 'ocupada') {
      const accepted = confirm(
        `Vas a cambiar la mesa de ocupada a ${this.statusLabels[status].toLowerCase()}: se cerrará su ocupación actual. ` +
        'Puede haber pedidos pendientes; no se eliminan ni se cancelan y seguirán en cocina y barra. ¿Continuar?'
      )
      if (!accepted) return
    }

    this.error.set(null)
    this.saving.set(true)
    try {
      if (this.tableId) {
        await this.store.update(this.restaurantId, this.tableId, {
          number: number as number,
          description,
          capacity: capacity as number,
          status
        })
      } else {
        await this.store.create(this.restaurantId, {
          number: number as number,
          description,
          capacity: capacity as number,
          status
        })
      }
      await this.router.navigateByUrl(this.listUrl)
    } catch (err) {
      this.error.set(this.describeError(err, 'No se pudo guardar la mesa. Inténtalo de nuevo.'))
    } finally {
      this.saving.set(false)
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
      if (detail.includes('number') || !this.isEditing) {
        return 'Ya existe una mesa con ese número en este restaurante.'
      }
      return 'Conflicto al guardar: el número ya existe en este restaurante o la capacidad es menor que el grupo que ocupa la mesa.'
    }
    return fallback
  }
}
