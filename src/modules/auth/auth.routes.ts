import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authRateLimit } from '../../middleware/rateLimit';
import * as controller from './auth.controller';
import { loginSchema, refreshSchema, patientLoginSchema, verifyOtpSchema } from './auth.schema';

const router = Router();

// ─── HMS / SuperAdmin Staff Auth ──────────────────────────────────────────────
router.post('/login',   authRateLimit, validate(loginSchema),   controller.login);
router.post('/refresh', validate(refreshSchema),                 controller.refresh);
router.post('/logout',  validate(refreshSchema),                 controller.logout);

// ─── B2C Patient Auth (OTP-based) ────────────────────────────────────────────
router.post('/patient/request-otp', authRateLimit, validate(patientLoginSchema), controller.patientRequestOtp);
router.post('/patient/verify-otp',  authRateLimit, validate(verifyOtpSchema),    controller.patientVerifyOtp);

export { router as authRouter };
