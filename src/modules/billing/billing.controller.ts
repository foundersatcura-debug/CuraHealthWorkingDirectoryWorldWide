import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated, sendNotFound } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { generateBillNumber } from '../../utils/idGenerator';
import { AppError } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../types';

export async function list(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { page, limit, skip } = getPagination(req);
  const status = req.query.status as string | undefined;
  const patient_id = req.query.patient_id as string | undefined;

  const where = {
    branch_id: user.branch_id,
    ...(status ? { status: status as never } : {}),
    ...(patient_id ? { patient_id } : {}),
  };

  const [bills, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      skip,
      take: limit,
      include: {
        patient: { select: { id: true, uhid: true, first_name: true, last_name: true } },
        _count: { select: { items: true, payments: true } },
      },
      orderBy: { bill_date: 'desc' },
    }),
    prisma.bill.count({ where }),
  ]);

  sendSuccess(res, bills, buildMeta(page, limit, total));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const bill = await prisma.bill.findUnique({
    where: { id: req.params.id },
    include: {
      patient: true,
      items: true,
      payments: true,
      admission: true,
      insurance_claims: { include: { provider: { select: { name: true } } } },
      refunds: true,
    },
  });
  if (!bill) { sendNotFound(res, 'Bill'); return; }
  sendSuccess(res, bill);
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { patient_id, admission_id, appointment_id, items, discount = 0, tax = 0, due_date, insurance_id, notes } =
    req.body as {
      patient_id: string;
      admission_id?: string;
      appointment_id?: string;
      items: Array<{ category: string; description: string; quantity: number; unit_price: number; discount?: number; reference_type?: string; reference_id?: string }>;
      discount?: number;
      tax?: number;
      due_date?: string;
      insurance_id?: string;
      notes?: string;
    };

  const bill_number = await generateBillNumber();
  const billItems = items.map(i => ({
    category: i.category,
    description: i.description,
    quantity: i.quantity,
    unit_price: i.unit_price,
    discount: i.discount ?? 0,
    amount: (i.unit_price * i.quantity) - (i.discount ?? 0),
    reference_type: i.reference_type,
    reference_id: i.reference_id,
  }));

  const subtotal = billItems.reduce((s, i) => s + i.amount, 0);
  const total = subtotal - discount + (subtotal * tax) / 100;

  const bill = await prisma.bill.create({
    data: {
      bill_number,
      patient_id,
      admission_id: admission_id || undefined,
      appointment_id: appointment_id || undefined,
      branch_id: user.branch_id,
      generated_by: user.id,
      due_date: due_date ? new Date(due_date) : undefined,
      subtotal,
      discount,
      tax,
      total,
      balance: total,
      paid_amount: 0,
      insurance_id,
      notes,
      items: { createMany: { data: billItems } },
    },
    include: { items: true },
  });

  sendCreated(res, bill);
}

export async function update(req: Request, res: Response): Promise<void> {
  const bill = await prisma.bill.update({ where: { id: req.params.id }, data: req.body as object });
  sendSuccess(res, bill);
}

export async function recordPayment(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { amount, method, reference_number, gateway_transaction_id, notes, payment_status } = req.body as {
    amount: number;
    method: string;
    reference_number?: string;
    gateway_transaction_id?: string;
    notes?: string;
    payment_status?: string;
  };

  const bill = await prisma.bill.findUnique({ where: { id: req.params.id } });
  if (!bill) throw new AppError('Bill not found', 404);
  if (amount > bill.balance) throw new AppError('Payment exceeds outstanding balance', 400);

  const newPaid = bill.paid_amount + amount;
  const newBalance = bill.total - newPaid;
  const newStatus = newBalance <= 0 ? 'PAID' : 'PARTIAL';

  const [payment] = await Promise.all([
    prisma.payment.create({
      data: {
        bill_id: bill.id,
        patient_id: bill.patient_id,
        amount,
        method: method as never,
        payment_status: (payment_status as never) ?? 'SUCCESS',
        reference_number,
        gateway_transaction_id,
        received_by: user.id,
        notes,
      },
    }),
    prisma.bill.update({
      where: { id: bill.id },
      data: { paid_amount: newPaid, balance: newBalance, status: newStatus as never },
    }),
  ]);

  sendCreated(res, payment);
}

export async function getPayments(req: Request, res: Response): Promise<void> {
  const payments = await prisma.payment.findMany({ where: { bill_id: req.params.id }, orderBy: { payment_date: 'desc' } });
  sendSuccess(res, payments);
}

// ─── Refunds ──────────────────────────────────────────────────────────────────

export async function createRefund(req: Request, res: Response): Promise<void> {
  const { payment_id, refund_amount, reason, gateway_refund_id } = req.body as {
    payment_id: string;
    refund_amount: number;
    reason?: string;
    gateway_refund_id?: string;
  };

  const payment = await prisma.payment.findUnique({ where: { id: payment_id } });
  if (!payment) throw new AppError('Payment not found', 404);
  if (refund_amount > payment.amount) throw new AppError('Refund amount exceeds payment amount', 400);

  const refund = await prisma.refund.create({
    data: {
      payment_id,
      bill_id: payment.bill_id,
      refund_amount,
      reason,
      gateway_refund_id,
    },
  });

  await prisma.payment.update({
    where: { id: payment_id },
    data: { payment_status: 'REFUNDED' },
  });

  sendCreated(res, refund);
}

export async function listRefunds(req: Request, res: Response): Promise<void> {
  const refunds = await prisma.refund.findMany({
    where: { bill_id: req.params.id },
    include: { payment: { select: { amount: true, method: true, payment_date: true } } },
    orderBy: { created_at: 'desc' },
  });
  sendSuccess(res, refunds);
}

// ─── Payment Gateway Webhook ──────────────────────────────────────────────────

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const { payment_id, event_type, payload } = req.body as {
    payment_id?: string;
    event_type: string;
    payload: object;
  };

  await prisma.paymentGatewayLog.create({
    data: {
      payment_id: payment_id || undefined,
      event_type,
      payload: payload as never,
    },
  });

  sendSuccess(res, { received: true });
}
