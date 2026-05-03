import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/token';
import { sendUnauthorized } from '../utils/response';
import { AuthenticatedRequest } from '../types';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    sendUnauthorized(res, 'No token provided');
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    if (payload.type !== 'access') {
      sendUnauthorized(res, 'Invalid token type');
      return;
    }

    (req as AuthenticatedRequest).user = {
      id: payload.sub,
      role: payload.role as never,
      branch_id: payload.branch_id,
      hospital_id: payload.hospital_id,
      email: '',
    };

    next();
  } catch {
    sendUnauthorized(res, 'Invalid or expired token');
  }
}

export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = verifyAccessToken(authHeader.slice(7));
      if (payload.type === 'access') {
        (req as AuthenticatedRequest).user = {
          id: payload.sub,
          role: payload.role as never,
          branch_id: payload.branch_id,
          email: '',
        };
      }
    } catch {
      // Silently ignore invalid tokens for optional auth
    }
  }
  next();
}
