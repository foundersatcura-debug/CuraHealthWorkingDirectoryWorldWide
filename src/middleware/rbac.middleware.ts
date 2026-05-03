/**
 * RBAC Middleware
 * Usage: router.get('/patients', requirePermission('patients', 'read'), controller)
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../data-source';
import { User } from '../entities';
import { Role } from '../entities';
import { AuditLog } from '../entities';

// ─── JWT Payload ──────────────────────────────────────────────────────────────

export interface JWTPayload {
  user_id: string;
  role_id: string;
  branch_id: string;
  role_type: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      permissions?: Record<string, Record<string, boolean>>;
    }
  }
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

// ─── Permission Loader ────────────────────────────────────────────────────────

export async function loadPermissions(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) { next(); return; }

  try {
    const roleRepo = AppDataSource.getRepository(Role);
    const role = await roleRepo.findOneBy({ role_id: req.user.role_id });
    if (role) req.permissions = role.permissions;
    next();
  } catch {
    next();
  }
}

// ─── Permission Guard ─────────────────────────────────────────────────────────

export function requirePermission(resource: string, action: 'read' | 'write' | 'delete') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // Super admin bypasses permission checks
    if (req.user.role_type === 'super_admin') { next(); return; }

    const perms = req.permissions ?? {};
    if (!perms[resource]?.[action]) {
      // Log the access denial
      await logAudit(req, 'ACCESS_DENIED', resource, undefined,
        `Attempted ${action} on ${resource} — insufficient permissions`,
        'failure', 'medium');

      res.status(403).json({
        success: false,
        message: `You do not have ${action} access to ${resource}`,
      });
      return;
    }

    next();
  };
}

// ─── Audit Logger ─────────────────────────────────────────────────────────────

export async function logAudit(
  req: Request,
  action: string,
  resource: string,
  resourceId?: string,
  description?: string,
  status: string = 'success',
  severity: string = 'low',
): Promise<void> {
  if (!req.user) return;

  try {
    const repo = AppDataSource.getRepository(AuditLog);
    await repo.save({
      user_id: req.user.user_id,
      branch_id: req.user.branch_id,
      action,
      resource,
      resource_id: resourceId,
      description: description ?? `${action} ${resource}`,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      status,
      severity,
    });
  } catch {
    // Non-critical: don't fail the request if audit logging fails
  }
}

// ─── Rate Limiting Helper ─────────────────────────────────────────────────────

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 }); // 15min window
    return true;
  }

  if (entry.count >= 10) return false; // Max 10 attempts per 15 min

  entry.count++;
  return true;
}
