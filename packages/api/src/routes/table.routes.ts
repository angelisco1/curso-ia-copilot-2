import { Router } from 'express'
import { TableController } from '@controllers/table.controller.js'
import { TableSessionController } from '@controllers/table-session.controller.js'
import { dbConfig } from '@config/database.js'
import { SqliteTableRepository } from '@repositories/table.repository.js'
import { SqliteTableSessionRepository } from '@repositories/table-session.repository.js'
import { SqliteRestaurantRepository } from '@repositories/restaurant.repository.js'
import { TableService } from '@services/table.service.js'
import { TableSessionService } from '@services/table-session.service.js'
import { authenticate, authorize } from '@shared/infrastructure/http/middlewares.js'

const tableRepository = new SqliteTableRepository(dbConfig)
const restaurantRepository = new SqliteRestaurantRepository(dbConfig)
const tableController = new TableController(new TableService(tableRepository, restaurantRepository))
const sessionController = new TableSessionController(
    new TableSessionService(tableRepository, new SqliteTableSessionRepository(dbConfig), restaurantRepository)
)

const router = Router({ mergeParams: true })
const staff = ['admin', 'manager', 'camarero']

router.post('/', authenticate, authorize(['admin']), tableController.create)
router.get('/', authenticate, authorize(staff), tableController.list)
// `available` debe registrarse antes de `/:tableId` para no interpretarse como un id.
router.get('/available', authenticate, authorize(['cliente']), sessionController.available)
router.get('/:tableId', authenticate, authorize(staff), tableController.get)
router.put('/:tableId', authenticate, authorize(['admin']), tableController.replace)
router.delete('/:tableId', authenticate, authorize(['admin']), tableController.delete)
router.patch('/:tableId/status', authenticate, authorize(staff), tableController.changeStatus)

export default router
