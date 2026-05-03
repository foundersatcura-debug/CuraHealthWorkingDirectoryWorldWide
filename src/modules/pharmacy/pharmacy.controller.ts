import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { AppError } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../types';
import { addDays } from 'date-fns';

export async function listMedicines(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { page, limit, skip } = getPagination(req);
  const search = req.query.search as string | undefined;
  const category = req.query.category as string | undefined;

  const where = {
    branch_id: user.branch_id ?? '',
    is_active: true,
    ...(category ? { category } : {}),
    ...(search ? { OR: [
      { name: { contains: search, mode: 'insensitive' as const } },
      { generic_name: { contains: search, mode: 'insensitive' as const } },
      { brand: { contains: search, mode: 'insensitive' as const } },
    ]} : {}),
  };

  const [medicines, total] = await Promise.all([
    prisma.medicine.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
    prisma.medicine.count({ where }),
  ]);

  sendSuccess(res, medicines, buildMeta(page, limit, total));
}

export async function getMedicine(req: Request, res: Response): Promise<void> {
  const med = await prisma.medicine.findUnique({ where: { id: req.params.id } });
  if (!med) throw new AppError('Medicine not found', 404);
  sendSuccess(res, med);
}

export async function createMedicine(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const med = await prisma.medicine.create({
    data: {
      branch_id: user.branch_id!,
      ...(req.body as object),
      expiry_date: (req.body as Record<string, string>).expiry_date ? new Date((req.body as Record<string, string>).expiry_date) : undefined,
    },
  });
  sendCreated(res, med);
}

export async function updateMedicine(req: Request, res: Response): Promise<void> {
  const med = await prisma.medicine.update({ where: { id: req.params.id }, data: req.body as object });
  sendSuccess(res, med);
}

export async function updateStock(req: Request, res: Response): Promise<void> {
  const { quantity, operation } = req.body as { quantity: number; operation: 'add' | 'set' };
  const med = await prisma.medicine.findUnique({ where: { id: req.params.id } });
  if (!med) throw new AppError('Medicine not found', 404);

  const newQty = operation === 'add' ? med.stock_quantity + quantity : quantity;
  const updated = await prisma.medicine.update({
    where: { id: req.params.id },
    data: { stock_quantity: newQty },
  });
  sendSuccess(res, updated);
}

export async function listPrescriptionsForDispensing(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const [prescriptions, total] = await Promise.all([
    prisma.prescription.findMany({
      where: { status: 'ACTIVE' },
      skip,
      take: limit,
      include: {
        items: { include: { medicine: { select: { name: true, stock_quantity: true } } } },
        medical_record: { include: { patient: { select: { first_name: true, last_name: true, uhid: true } } } },
      },
      orderBy: { prescription_date: 'desc' },
    }),
    prisma.prescription.count({ where: { status: 'ACTIVE' } }),
  ]);
  sendSuccess(res, prescriptions, buildMeta(page, limit, total));
}

export async function dispensePrescription(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const prescription = await prisma.prescription.findUnique({
    where: { id: req.params.id },
    include: { items: true },
  });
  if (!prescription) throw new AppError('Prescription not found', 404);
  if (prescription.status !== 'ACTIVE') throw new AppError('Prescription already dispensed or cancelled', 400);

  // Deduct stock for each medicine item
  for (const item of prescription.items) {
    if (item.medicine_id) {
      await prisma.medicine.update({
        where: { id: item.medicine_id },
        data: { stock_quantity: { decrement: item.quantity } },
      });
    }
  }

  await prisma.prescription.update({
    where: { id: req.params.id },
    data: { status: 'DISPENSED', dispensed_date: new Date(), dispensed_by: user.id },
  });

  sendSuccess(res, { message: 'Prescription dispensed successfully' });
}

export async function lowStock(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const medicines = await prisma.medicine.findMany({
    where: {
      branch_id: user.branch_id ?? '',
      is_active: true,
      stock_quantity: { lte: prisma.medicine.fields.reorder_level as never },
    },
    orderBy: { stock_quantity: 'asc' },
  });
  // Prisma doesn't support column comparison directly, so use raw approach
  const lowStock = await prisma.$queryRaw<{ id: string; name: string; stock_quantity: number; reorder_level: number }[]>`
    SELECT id, name, stock_quantity, reorder_level
    FROM medicines
    WHERE branch_id = ${user.branch_id}
      AND is_active = true
      AND stock_quantity <= reorder_level
    ORDER BY stock_quantity ASC
  `;
  sendSuccess(res, lowStock);
}

export async function expiringSoon(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const in30Days = addDays(new Date(), 30);
  const medicines = await prisma.medicine.findMany({
    where: {
      branch_id: user.branch_id ?? '',
      is_active: true,
      expiry_date: { lte: in30Days, gte: new Date() },
    },
    orderBy: { expiry_date: 'asc' },
  });
  sendSuccess(res, medicines);
}
