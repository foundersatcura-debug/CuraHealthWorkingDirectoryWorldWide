import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { sendForbidden } from '../utils/response';
import { AuthenticatedRequest } from '../types';

// Role hierarchy: higher index = more authority
const ROLE_HIERARCHY: UserRole[] = [
  'PHARMACY',
  'LAB_TECHNICIAN',
  'RECEPTIONIST',
  'NURSE',
  'DOCTOR',
  'BRANCH_ADMIN',
  'SUPER_ADMIN',
  'FOUNDER',
];

export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      sendForbidden(res, 'Authentication required');
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      sendForbidden(res, `Access denied. Required roles: ${allowedRoles.join(', ')}`);
      return;
    }

    next();
  };
}

export function authorizeMinRole(minRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      sendForbidden(res, 'Authentication required');
      return;
    }

    const userRoleIndex = ROLE_HIERARCHY.indexOf(user.role);
    const minRoleIndex = ROLE_HIERARCHY.indexOf(minRole);

    if (userRoleIndex < minRoleIndex) {
      sendForbidden(res, 'Insufficient permissions');
      return;
    }

    next();
  };
}

// Ensure request targets the user's own branch
export function sameBranch(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    sendForbidden(res);
    return;
  }

  // FOUNDERs and SUPER_ADMINs bypass branch checks
  if (['FOUNDER', 'SUPER_ADMIN'].includes(user.role)) {
    next();
    return;
  }

  const branchId = req.params.branchId || req.query.branch_id || req.body?.branch_id;
  if (branchId && branchId !== user.branch_id) {
    sendForbidden(res, 'Cross-branch access denied');
    return;
  }

  next();
}
