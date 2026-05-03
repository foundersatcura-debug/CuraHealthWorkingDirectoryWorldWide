import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated, sendNotFound } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { AppError } from '../../middleware/errorHandler';

// ─── Insurance Providers ──────────────────────────────────────────────────────

export async function listProviders(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);

  const [providers, total] = await Promise.all([
    prisma.insuranceProvider.findMany({
      where: { is_active: true },
      skip,
      take: limit,
      include: { _count: { select: { claims: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.insuranceProvider.count({ where: { is_active: true } }),
  ]);

  sendSuccess(res, providers, buildMeta(page, limit, total));
}

export async function getProvider(req: Request, res: Response): Promise<void> {
  const provider = await prisma.insuranceProvider.findUnique({ where: { id: req.params.id } });
  if (!provider) { sendNotFound(res, 'Insurance provider'); return; }
  sendSuccess(res, provider);
}

export async function createProvider(req: Request, res: Response): Promise<void> {
  const provider = await prisma.insuranceProvider.create({ data: req.body as object });
  sendCreated(res, provider);
}

export async function updateProvider(req: Request, res: Response): Promise<void> {
  const provider = await prisma.insuranceProvider.update({
    where: { id: req.params.id },
    data: req.body as object,
  });
  sendSuccess(res, provider);
}

// ─── Insurance Claims ─────────────────────────────────────────────────────────

export async function listClaims(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const bill_id = req.query.bill_id as string | undefined;
  const status = req.query.status as string | undefined;
  const provider_id = req.query.provider_id as string | undefined;

  const where = {
    ...(bill_id ? { bill_id } : {}),
    ...(status ? { claim_status: status as never } : {}),
    ...(provider_id ? { provider_id } : {}),
  };

  const [claims, total] = await Promise.all([
    prisma.insuranceClaim.findMany({
      where,
      skip,
      take: limit,
      include: {
        bill: { select: { bill_number: true, total: true, patient: { select: { first_name: true, last_name: true, uhid: true } } } },
        provider: { select: { name: true } },
      },
      orderBy: { submission_date: 'desc' },
    }),
    prisma.insuranceClaim.count({ where }),
  ]);

  sendSuccess(res, claims, buildMeta(page, limit, total));
}

export async function getClaim(req: Request, res: Response): Promise<void> {
  const claim = await prisma.insuranceClaim.findUnique({
    where: { id: req.params.id },
    include: { bill: { include: { patient: true, items: true } }, provider: true },
  });
  if (!claim) { sendNotFound(res, 'Insurance claim'); return; }
  sendSuccess(res, claim);
}

export async function createClaim(req: Request, res: Response): Promise<void> {
  const { bill_id, provider_id, policy_number, amount_claimed, notes } =
    req.body as Record<string, string | number>;

  const bill = await prisma.bill.findUnique({ where: { id: bill_id as string } });
  if (!bill) throw new AppError('Bill not found', 404);

  const claim = await prisma.insuranceClaim.create({
    data: {
      bill_id: bill_id as string,
      provider_id: provider_id as string,
      policy_number: policy_number as string,
      amount_claimed: Number(amount_claimed),
      notes: notes as string | undefined,
    },
    include: { provider: { select: { name: true } } },
  });

  sendCreated(res, claim);
}

export async function updateClaimStatus(req: Request, res: Response): Promise<void> {
  const { claim_status, amount_approved, notes } = req.body as {
    claim_status: string;
    amount_approved?: number;
    notes?: string;
  };

  const claim = await prisma.insuranceClaim.update({
    where: { id: req.params.id },
    data: {
      claim_status: claim_status as never,
      ...(amount_approved !== undefined ? { amount_approved } : {}),
      ...(claim_status === 'APPROVED' ? { approval_date: new Date() } : {}),
      ...(notes ? { notes } : {}),
    },
  });

  sendSuccess(res, claim);
}
