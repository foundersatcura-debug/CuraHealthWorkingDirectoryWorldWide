import { Request, Response } from 'express';
import * as service from './patients.service';
import { sendSuccess, sendCreated, sendNoContent, sendError } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';
import type { CreatePatientInput, UpdatePatientInput, PatientQuery } from './patients.schema';

export async function list(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  if (!user.branch_id) { sendError(res, 'Branch context required', 400); return; }
  const result = await service.listPatients(user.branch_id, req.query as unknown as PatientQuery);
  sendSuccess(res, result.data, result.meta);
}

export async function search(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  if (!user.branch_id) { sendError(res, 'Branch context required', 400); return; }
  const patients = await service.searchPatients(user.branch_id, req.query.q as string);
  sendSuccess(res, patients);
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const patient = await service.getPatient(req.params.id);
  sendSuccess(res, patient);
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  if (!user.branch_id) { sendError(res, 'Branch context required', 400); return; }
  const patient = await service.createPatient(user.branch_id, req.body as CreatePatientInput);
  sendCreated(res, patient);
}

export async function update(req: Request, res: Response): Promise<void> {
  const patient = await service.updatePatient(req.params.id, req.body as UpdatePatientInput);
  sendSuccess(res, patient);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.deactivatePatient(req.params.id);
  sendNoContent(res);
}

export async function timeline(req: Request, res: Response): Promise<void> {
  const data = await service.getPatientTimeline(req.params.id);
  sendSuccess(res, data);
}
