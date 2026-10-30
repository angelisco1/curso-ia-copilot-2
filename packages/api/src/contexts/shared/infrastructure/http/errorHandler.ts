import type { Request, Response, NextFunction } from 'express'
import { AppError } from '@errors/AppError.js'

const NOT_FOUND_ERRORS = [
    'EmployeeNotFoundError',
    'RestaurantNotFoundError',
    'IngredientNotFoundError',
    'DishNotFoundError',
    'TableNotFoundError',
    'TableSessionNotFoundError'
]

const CONFLICT_ERRORS = [
    'TableNumberConflictError',
    'TableCapacityConflictError',
    'TableNotAvailableError',
    'TableCapacityExceededError',
    'ActiveTableSessionExistsError',
    'TableSessionClosedError'
]

const FORBIDDEN_ERRORS = [
    'ForbiddenRestaurantError',
    'ForbiddenRoleError',
    'TableSessionForbiddenError'
]

const UNAUTHORIZED_ERRORS = [
    'InvalidCredentialsError',
    'InvalidActorError'
]

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof AppError) {
        let statusCode = 400

        if (NOT_FOUND_ERRORS.includes(err.name)) {
            statusCode = 404
        } else if (UNAUTHORIZED_ERRORS.includes(err.name)) {
            statusCode = 401
        } else if (CONFLICT_ERRORS.includes(err.name)) {
            statusCode = 409
        } else if (FORBIDDEN_ERRORS.includes(err.name)) {
            statusCode = 403
        }

        res.status(statusCode).json({
            error: err.name,
            message: err.message
        })
        return
    }

    res.status(500).json({ error: 'InternalServerError', message: 'Something went wrong' })
}
