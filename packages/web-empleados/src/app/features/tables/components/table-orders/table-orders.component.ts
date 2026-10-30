import { Component, input } from '@angular/core';
import { Order } from '../../../orders/models/order.model';

@Component({
  selector: 'app-table-orders',
  standalone: true,
  templateUrl: './table-orders.component.html',
  styleUrl: './table-orders.component.css'
})
export class TableOrdersComponent {
  readonly orders = input.required<Order[]>();
  readonly loading = input(false);
  readonly error = input<string | null>(null);
}
