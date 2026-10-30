import { Component, inject, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService, AuthStore } from '@resttek/web-shared';
import { canAccessSalon } from '../auth/salon-access';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css'
})
export class ShellComponent {
  readonly authService = inject(AuthService)
  readonly authStore = inject(AuthStore)
  private readonly router = inject(Router)

  readonly userRole = computed(() => this.authStore.userRole())
  readonly userRestaurantId = computed(() => this.authStore.user()?.restaurantId)
  readonly hasRestaurant = computed(() => !!this.authStore.user()?.restaurantId)
  /** Admin no tiene restaurante asignado: elige uno en salón. */
  readonly canEnter = computed(() => this.hasRestaurant() || this.userRole() === 'admin')

  readonly canSeeCocina = computed(() => 
    this.userRole() === 'cocinero' || this.userRole() === 'manager'
  )

  readonly canSeeBarra = computed(() => 
    this.userRole() === 'camarero' || this.userRole() === 'manager'
  )

  readonly canSeeSalon = computed(() => canAccessSalon(this.userRole()))

  readonly defaultRoute = computed(() => {
    const role = this.userRole()
    if (role === 'cocinero') return '/cocina'
    if (role === 'manager') return '/cocina'
    if (role === 'camarero') return '/barra'
    if (role === 'admin') return '/salon'
    return '/login'
  })

  logout(): void {
    this.authService.logout()
  }
}
