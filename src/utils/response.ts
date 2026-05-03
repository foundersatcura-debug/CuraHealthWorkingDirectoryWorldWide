import { Response } from 'express';

interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  total_pages?: number;
  [key: string]: unknown;
}

export function sendSuccess<T>(res: Response, data: T, meta?: ApiMeta, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function sendCreated<T>(res: Response, data: T): void {
  res.status(201).json({ success: true, data });
}

export function sendNoContent(res: Response): void {
  res.status(204).send();
}

export function sendError(res: Response, message: string, statusCode = 400, errors?: unknown): void {
  res.status(statusCode).json({ success: false, message, ...(errors ? { errors } : {}) });
}

export function sendNotFound(res: Response, resource = 'Resource'): void {
  res.status(404).json({ success: false, message: `${resource} not found` });
}

export function sendUnauthorized(res: Response, message = 'Unauthorized'): void {
  res.status(401).json({ success: false, message });
}

export function sendForbidden(res: Response, message = 'Forbidden'): void {
  res.status(403).json({ success: false, message });
}

export function sendConflict(res: Response, message: string): void {
  res.status(409).json({ success: false, message });
}
