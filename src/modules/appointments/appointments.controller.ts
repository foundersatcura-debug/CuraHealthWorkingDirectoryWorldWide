import { Request, Response } from 'express';
import * as service from './appointments.service';
import { sendSuccess, sendCreated, sendError } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';
import type { CreateAppointmentInput, UpdateStatusInput, AppointmentQuery } from './appointments.schema';

export async function list(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const doctorId = user.role === 'DOCTOR' ? req.query.doctor_id as string || '' : undefined;
  const branchId = user.branch_id ?? '';
  const result = await service.listAppointments(
    doctorId || branchId,
    req.query as unknown as AppointmentQuery,
  );
  sendSuccess(res, result.data, result.meta);
}

export async function byDate(req: Request, res: Response): Promise<void> {
  const { doctor_id, date } = req.query as { doctor_id?: string; date?: string };
  if (!doctor_id || !date) { sendError(res, 'doctor_id and date are required', 400); return; }
  const appts = await service.getAppointmentsByDate(doctor_id, date);
  sendSuccess(res, appts);
}

export async function queueStats(req: Request, res: Response): Promise<void> {
  const { doctor_id, date } = req.query as { doctor_id?: string; date?: string };
  if (!doctor_id || !date) { sendError(res, 'doctor_id and date are required', 400); return; }
  const stats = await service.getQueueStats(doctor_id, date);
  sendSuccess(res, stats);
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const appt = await service.getAppointment(req.params.id);
  sendSuccess(res, appt);
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const appt = await service.createAppointment(user.branch_id ?? '', req.body as CreateAppointmentInput);
  sendCreated(res, appt);
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  const appt = await service.updateAppointmentStatus(req.params.id, req.body as UpdateStatusInput);
  sendSuccess(res, appt);
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const appt = await service.updateAppointmentStatus(req.params.id, {
    status: 'CANCELLED',
    cancel_reason: (req.body as { reason?: string }).reason,
  });
  sendSuccess(res, appt);
}
