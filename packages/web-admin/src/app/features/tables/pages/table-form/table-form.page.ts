import { Component, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, type ValidationErrors } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { LucideAngularModule } from 'lucide-angular'
import { startWith } from 'rxjs'
import { TABLE_STATUSES, type TableStatus } from '../../models/table.model'
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
export class TableFormPage {
  private readonly store = inject(TableStore)
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
  readonly saving = signal(false)
  readonly error = signal<string | null>(null)

  readonly form = this.fb.group({
    number: this.fb.control<number | null>(null, positiveInteger),
    description: this.fb.control(''),
    capacity: this.fb.control<number | null>(null, positiveInteger),
    status: this.fb.control<TableStatus>('libre')
  })

  private readonly formStatus = toSignal(this.form.statusChanges.pipe(startWith(this.form.status)), {
    initialValue: this.form.status
  })
  readonly submitDisabled = computed(() => this.formStatus() !== 'VALID' || this.saving())

  readonly pageTitle = 'Nueva mesa'
  readonly listUrl = `/restaurants/${this.restaurantId}/tables`

  showError(name: 'number' | 'capacity'): boolean {
    const control = this.form.controls[name]
    return control.invalid && (control.dirty || control.touched)
  }

  async onSubmit(): Promise<void> {
    if (this.saving()) return
    this.form.markAllAsTouched()
    if (this.form.invalid) return

    const { number, description, capacity, status } = this.form.getRawValue()
    this.error.set(null)
    this.saving.set(true)
    try {
      await this.store.create(this.restaurantId, {
        number: number as number,
        description,
        capacity: capacity as number,
        status
      })
      await this.router.navigateByUrl(this.listUrl)
    } catch (err) {
      this.error.set(this.describeError(err))
    } finally {
      this.saving.set(false)
    }
  }

  private describeError(err: unknown): string {
    const status = (err as { status?: number } | null)?.status
    if (status === 409) return 'Ya existe una mesa con ese número en este restaurante.'
    return 'No se pudo guardar la mesa. Inténtalo de nuevo.'
  }
}
