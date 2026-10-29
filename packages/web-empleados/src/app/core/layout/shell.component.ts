import { Component, inject, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService, AuthStore } from '@resttek/web-shared';
import { getInitialRoute } from '../auth/employee-access';

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

  readonly canSeeCocina = computed(() =>
    this.userRole() === 'cocinero' || this.userRole() === 'manager' || this.userRole() === 'admin'
  )

  readonly canSeeBarra = computed(() =>
    this.userRole() === 'camarero' || this.userRole() === 'manager' || this.userRole() === 'admin'
  )

  readonly canSeeSalon = computed(() =>
    this.userRole() === 'camarero' || this.userRole() === 'manager' || this.userRole() === 'admin'
  )

  readonly defaultRoute = computed(() => getInitialRoute(this.userRole()))

  logout(): void {
    this.authService.logout()
  }
}
