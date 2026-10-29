import { Router } from 'express'
import { TableSessionController } from '@controllers/table-session.controller.js'
import { dbConfig } from '@config/database.js'
import { SqliteTableRepository } from '@repositories/table.repository.js'
import { SqliteTableSessionRepository } from '@repositories/table-session.repository.js'
import { SqliteRestaurantRepository } from '@repositories/restaurant.repository.js'
import { TableSessionService } from '@services/table-session.service.js'
import { authenticate, authorize } from '@shared/infrastructure/http/middlewares.js'

const controller = new TableSessionController(new TableSessionService(
    new SqliteTableRepository(dbConfig),
    new SqliteTableSessionRepository(dbConfig),
    new SqliteRestaurantRepository(dbConfig)
))

const router = Router({ mergeParams: true })

router.post('/', authenticate, authorize(['cliente']), controller.confirm)
router.get('/current', authenticate, authorize(['cliente']), controller.current)

export default router
