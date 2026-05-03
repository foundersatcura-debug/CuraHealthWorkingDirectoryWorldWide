import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../types';
import { logger } from '../utils/logger';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW' | 'LOGIN' | 'LOGOUT';

export function audit(resource: string, action: AuditAction) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const user = (req as AuthenticatedRequest).user;

    try {
      await prisma.auditLog.create({
        data: {
          branch_id: user?.branch_id,
          user_id: user?.id,
          action,
          resource,
          resource_id: req.params.id,
          changes: action !== 'VIEW' ? (req.body as object) : undefined,
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
        },
      });
    } catch (err) {
      logger.warn('Audit log failed:', err);
    }

    next();
  };
}
