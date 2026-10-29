import type { Response, NextFunction } from 'express'
import type { AuthRequest } from '@shared/infrastructure/http/middlewares.js'
import type { TableService } from '@services/table.service.js'
import { toActor } from '@models/actor.model.js'

export class TableController {
    constructor(private readonly tableService: TableService) {}

    create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const table = await this.tableService.create(toActor(req.user), req.params.restaurantId as string, req.body)
            res.status(201).json(table)
        } catch (error) {
            next(error)
        }
    }

    list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            res.status(200).json(await this.tableService.list(toActor(req.user), req.params.restaurantId as string))
        } catch (error) {
            next(error)
        }
    }

    get = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const table = await this.tableService.get(toActor(req.user), req.params.restaurantId as string, req.params.tableId as string)
            res.status(200).json(table)
        } catch (error) {
            next(error)
        }
    }

    replace = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const table = await this.tableService.replace(
                toActor(req.user), req.params.restaurantId as string, req.params.tableId as string, req.body
            )
            res.status(200).json(table)
        } catch (error) {
            next(error)
        }
    }

    changeStatus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const table = await this.tableService.changeStatus(
                toActor(req.user), req.params.restaurantId as string, req.params.tableId as string, req.body
            )
            res.status(200).json(table)
        } catch (error) {
            next(error)
        }
    }

    delete = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            await this.tableService.delete(toActor(req.user), req.params.restaurantId as string, req.params.tableId as string)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}
