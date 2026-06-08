import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { AuthenticatedRequest } from '../../types';

export async function getInventory(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const inventory = await prisma.bloodInventory.findMany({
    where: { branch_id: user.branch_id ?? '' },
    orderBy: { blood_group: 'asc' },
  });
  sendSuccess(res, inventory);
}

export async function listDonations(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { page, limit, skip } = getPagination(req);
  const blood_group = req.query.blood_group as string | undefined;

  const where = { branch_id: user.branch_id, ...(blood_group ? { blood_group: blood_group as never } : {}) };
  const [donations, total] = await Promise.all([
    prisma.bloodDonation.findMany({ where, skip, take: limit, orderBy: { donation_date: 'desc' } }),
    prisma.bloodDonation.count({ where }),
  ]);
  sendSuccess(res, donations, buildMeta(page, limit, total));
}

export async function recordDonation(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { donor_name, donor_phone, blood_group, units } = req.body as Record<string, string>;

  const donation = await prisma.bloodDonation.create({
    data: {
      branch_id: user.branch_id,
      donor_name,
      donor_phone,
      blood_group: blood_group as never,
      units: Number(units) || 1,
      expiry_date: new Date(Date.now() + 42 * 24 * 60 * 60 * 1000), // 42-day shelf life
    },
  });

  // Update inventory
  await prisma.bloodInventory.upsert({
    where: { branch_id_blood_group: { branch_id: user.branch_id!, blood_group: blood_group as never } },
    create: { branch_id: user.branch_id!, blood_group: blood_group as never, units_available: Number(units) || 1, reserved_units: 0 },
    update: { units_available: { increment: Number(units) || 1 } },
  });

  sendCreated(res, donation);
}

export async function listRequests(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { page, limit, skip } = getPagination(req);
  const status = req.query.status as string | undefined;

  const where = { branch_id: user.branch_id, ...(status ? { status: status as never } : {}) };
  const [requests, total] = await Promise.all([
    prisma.bloodRequest.findMany({
      where,
      skip,
      take: limit,
      include: {
        patient: { select: { first_name: true, last_name: true, uhid: true } },
        doctor: { include: { user: { select: { first_name: true, last_name: true } } } },
      },
      orderBy: { request_date: 'desc' },
    }),
    prisma.bloodRequest.count({ where }),
  ]);
  sendSuccess(res, requests, buildMeta(page, limit, total));
}

export async function createRequest(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const request = await prisma.bloodRequest.create({
    data: { branch_id: user.branch_id, ...req.body },
  });
  sendCreated(res, request);
}

export async function updateRequest(req: Request, res: Response): Promise<void> {
  const { status, units_issued } = req.body as { status: string; units_issued?: number };

  const request = await prisma.bloodRequest.update({
    where: { id: req.params.id },
    data: {
      status: status as never,
      ...(units_issued ? { units_issued, issued_date: new Date() } : {}),
      ...(status === 'APPROVED' ? { approved_date: new Date() } : {}),
    },
  });

  // If issued, deduct from inventory
  if (status === 'ISSUED' && units_issued) {
    const req2 = await prisma.bloodRequest.findUnique({ where: { id: request.id } });
    if (req2?.branch_id) {
      await prisma.bloodInventory.updateMany({
        where: { branch_id: req2.branch_id, blood_group: req2.blood_group },
        data: { units_available: { decrement: units_issued }, reserved_units: { decrement: units_issued } },
      });
    }
  }

  sendSuccess(res, request);
}
