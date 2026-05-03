import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated, sendNotFound } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { AppError } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../types';
import { addDays } from 'date-fns';

// ─── Inventory Items ──────────────────────────────────────────────────────────

export async function listItems(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { page, limit, skip } = getPagination(req);
  const search = req.query.search as string | undefined;
  const item_type = req.query.item_type as string | undefined;

  const where = {
    branch_id: user.branch_id,
    is_active: true,
    ...(item_type ? { item_type: item_type as never } : {}),
    ...(search ? { item_name: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      skip,
      take: limit,
      include: {
        batches: {
          where: { current_quantity: { gt: 0 } },
          orderBy: { expiry_date: 'asc' },
        },
      },
      orderBy: { item_name: 'asc' },
    }),
    prisma.inventoryItem.count({ where }),
  ]);

  sendSuccess(res, items, buildMeta(page, limit, total));
}

export async function getItem(req: Request, res: Response): Promise<void> {
  const item = await prisma.inventoryItem.findUnique({
    where: { id: req.params.id },
    include: { batches: { orderBy: { expiry_date: 'asc' } } },
  });
  if (!item) { sendNotFound(res, 'Inventory item'); return; }
  sendSuccess(res, item);
}

export async function createItem(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const item = await prisma.inventoryItem.create({
    data: { branch_id: user.branch_id, ...(req.body as object) },
  });
  sendCreated(res, item);
}

export async function updateItem(req: Request, res: Response): Promise<void> {
  const item = await prisma.inventoryItem.update({
    where: { id: req.params.id },
    data: req.body as object,
  });
  sendSuccess(res, item);
}

export async function lowStockItems(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const items = await prisma.$queryRaw<Array<{
    id: string;
    item_name: string;
    item_type: string;
    low_stock_threshold: number;
    total_quantity: number;
  }>>`
    SELECT
      i.id,
      i.item_name,
      i.item_type,
      i.low_stock_threshold,
      COALESCE(SUM(b.current_quantity), 0) AS total_quantity
    FROM inventory_items i
    LEFT JOIN item_batches b ON b.item_id = i.id
    WHERE i.branch_id = ${user.branch_id}
      AND i.is_active = true
    GROUP BY i.id
    HAVING COALESCE(SUM(b.current_quantity), 0) <= i.low_stock_threshold
    ORDER BY total_quantity ASC
  `;
  sendSuccess(res, items);
}

// ─── Item Batches ─────────────────────────────────────────────────────────────

export async function listBatches(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const item_id = req.query.item_id as string | undefined;

  const where = { ...(item_id ? { item_id } : {}) };

  const [batches, total] = await Promise.all([
    prisma.itemBatch.findMany({
      where,
      skip,
      take: limit,
      include: { inventory_item: { select: { item_name: true, item_type: true } } },
      orderBy: { expiry_date: 'asc' },
    }),
    prisma.itemBatch.count({ where }),
  ]);

  sendSuccess(res, batches, buildMeta(page, limit, total));
}

export async function createBatch(req: Request, res: Response): Promise<void> {
  const { item_id, batch_number, expiry_date, mrp, cost_price, current_quantity } =
    req.body as Record<string, string | number>;

  const item = await prisma.inventoryItem.findUnique({ where: { id: item_id as string } });
  if (!item) throw new AppError('Inventory item not found', 404);

  const batch = await prisma.itemBatch.create({
    data: {
      item_id: item_id as string,
      batch_number: batch_number as string,
      expiry_date: expiry_date ? new Date(expiry_date as string) : undefined,
      mrp: Number(mrp) || 0,
      cost_price: Number(cost_price) || 0,
      current_quantity: Number(current_quantity) || 0,
    },
  });

  sendCreated(res, batch);
}

export async function updateBatch(req: Request, res: Response): Promise<void> {
  const batch = await prisma.itemBatch.update({
    where: { id: req.params.id },
    data: req.body as object,
  });
  sendSuccess(res, batch);
}

export async function adjustBatchQuantity(req: Request, res: Response): Promise<void> {
  const { quantity, operation } = req.body as { quantity: number; operation: 'add' | 'set' | 'subtract' };
  const batch = await prisma.itemBatch.findUnique({ where: { id: req.params.id } });
  if (!batch) throw new AppError('Batch not found', 404);

  let newQty: number;
  if (operation === 'add') newQty = batch.current_quantity + quantity;
  else if (operation === 'subtract') newQty = Math.max(0, batch.current_quantity - quantity);
  else newQty = quantity;

  const updated = await prisma.itemBatch.update({
    where: { id: req.params.id },
    data: { current_quantity: newQty },
  });
  sendSuccess(res, updated);
}

export async function expiringSoon(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const in30Days = addDays(new Date(), 30);

  const batches = await prisma.itemBatch.findMany({
    where: {
      inventory_item: { branch_id: user.branch_id, is_active: true },
      expiry_date: { lte: in30Days, gte: new Date() },
      current_quantity: { gt: 0 },
    },
    include: { inventory_item: { select: { item_name: true, item_type: true } } },
    orderBy: { expiry_date: 'asc' },
  });

  sendSuccess(res, batches);
}
