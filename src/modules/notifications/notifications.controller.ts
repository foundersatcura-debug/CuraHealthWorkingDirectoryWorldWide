import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { AuthenticatedRequest } from '../../types';

export async function list(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { page, limit, skip } = getPagination(req);
  const unread_only = req.query.unread_only === 'true';

  const where = {
    user_id: user.id,
    ...(unread_only ? { is_read: false } : {}),
  };

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.notification.count({ where }),
  ]);

  sendSuccess(res, notifications, buildMeta(page, limit, total));
}

export async function markRead(req: Request, res: Response): Promise<void> {
  await prisma.notification.update({
    where: { id: req.params.id },
    data: { is_read: true, read_at: new Date() },
  });
  sendSuccess(res, { message: 'Marked as read' });
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  await prisma.notification.updateMany({
    where: { user_id: user.id, is_read: false },
    data: { is_read: true, read_at: new Date() },
  });
  sendSuccess(res, { message: 'All notifications marked as read' });
}
