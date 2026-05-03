import { Request, Response } from 'express';
import * as authService from './auth.service';
import { sendSuccess, sendCreated } from '../../utils/response';
import type { LoginInput, PatientLoginInput, VerifyOtpInput } from './auth.schema';
import { verifyRefreshToken } from '../../utils/token';

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.loginStaff(req.body as LoginInput);
  sendCreated(res, result);
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refresh_token } = req.body as { refresh_token: string };
  const result = await authService.refreshStaffToken(refresh_token);
  sendSuccess(res, result);
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refresh_token } = req.body as { refresh_token: string };
  const payload = verifyRefreshToken(refresh_token);
  await authService.logoutStaff(payload.sub, payload.jti);
  sendSuccess(res, { message: 'Logged out successfully' });
}

export async function patientRequestOtp(req: Request, res: Response): Promise<void> {
  const result = await authService.requestPatientOtp(req.body as PatientLoginInput);
  sendSuccess(res, result);
}

export async function patientVerifyOtp(req: Request, res: Response): Promise<void> {
  const result = await authService.verifyPatientOtp(req.body as VerifyOtpInput);
  sendCreated(res, result);
}
