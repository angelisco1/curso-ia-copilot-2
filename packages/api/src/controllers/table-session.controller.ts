import type { Response, NextFunction } from 'express'
import type { AuthRequest } from '@shared/infrastructure/http/middlewares.js'
import type { TableSessionService } from '@services/table-session.service.js'
import { toActor } from '@models/actor.model.js'

export class TableSessionController {
    constructor(private readonly sessionService: TableSessionService) {}

    available = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const tables = await this.sessionService.listAvailable(
                toActor(req.user), req.params.restaurantId as string, req.query.partySize
            )
            res.status(200).json(tables)
        } catch (error) {
            next(error)
        }
    }

    confirm = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { occupancy, created } = await this.sessionService.confirm(
                toActor(req.user), req.params.restaurantId as string, req.body
            )
            res.status(created ? 201 : 200).json(occupancy)
        } catch (error) {
            next(error)
        }
    }

    current = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const occupancy = await this.sessionService.current(toActor(req.user), req.params.restaurantId as string)
            res.status(200).json(occupancy)
        } catch (error) {
            next(error)
        }
    }
}
