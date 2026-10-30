import { Component, inject, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService, AuthStore } from '@resttek/web-shared';
import { canAccessView } from '../auth/employee-access';

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

  readonly userRole = computed(() => this.authStore.userRole())
  readonly userRestaurantId = computed(() => this.authStore.user()?.restaurantId)
  readonly hasRestaurant = computed(() => !!this.authStore.user()?.restaurantId)

  readonly canSeeCocina = computed(() => canAccessView(this.userRole(), 'cocina'))

  readonly canSeeBarra = computed(() => canAccessView(this.userRole(), 'barra'))

  readonly canSeeSalon = computed(() => canAccessView(this.userRole(), 'salon'))

  logout(): void {
    this.authService.logout()
  }
}
