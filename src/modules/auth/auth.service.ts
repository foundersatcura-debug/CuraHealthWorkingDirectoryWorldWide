import crypto from 'crypto';
import { prisma } from '../../config/database';
import { redis, cache } from '../../config/redis';
import { comparePassword } from '../../utils/password';
import {
  signAccessToken,
  signRefreshToken,
  signPatientToken,
  verifyRefreshToken,
  getRefreshExpiryDate,
} from '../../utils/token';
import { generateOtp } from '../../utils/password';
import { AppError } from '../../middleware/errorHandler';
import type { LoginInput, PatientLoginInput, VerifyOtpInput } from './auth.schema';

const OTP_TTL = 300; // 5 minutes

export async function loginStaff(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { doctor: true, branch: { include: { hospital: true } } },
  });

  if (!user || !user.is_active) {
    throw new AppError('Invalid credentials', 401);
  }

  const valid = await comparePassword(input.password, user.password);
  if (!valid) throw new AppError('Invalid credentials', 401);

  if (input.role && user.role !== input.role) {
    throw new AppError(`Account role mismatch. Expected: ${user.role}`, 401);
  }

  await prisma.user.update({ where: { id: user.id }, data: { last_login: new Date() } });

  const jti = crypto.randomUUID();
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    branch_id: user.branch_id ?? undefined,
    hospital_id: user.branch?.hospital_id ?? undefined,
  });
  const refreshToken = signRefreshToken({ sub: user.id, jti });

  await prisma.refreshToken.create({
    data: { user_id: user.id, token: jti, expires_at: getRefreshExpiryDate() },
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      email: user.email,
      full_name: `${user.first_name} ${user.last_name}`,
      role: user.role,
      branch_id: user.branch_id,
      branch_name: user.branch?.name,
      hospital_id: user.branch?.hospital_id,
      hospital_name: user.branch?.hospital?.name,
      doctor_id: user.doctor?.id,
      specialization: user.doctor?.specialization,
      license_no: user.doctor?.license_no,
      avatar_url: user.avatar_url,
    },
  };
}

export async function refreshStaffToken(refreshToken: string) {
  let payload: ReturnType<typeof verifyRefreshToken>;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid refresh token', 401);
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token: payload.jti } });
  if (!stored || stored.revoked_at || stored.expires_at < new Date()) {
    throw new AppError('Refresh token expired or revoked', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.is_active) throw new AppError('User not found or inactive', 401);

  // Rotate refresh token
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked_at: new Date() } });

  const jti = crypto.randomUUID();
  const newAccessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    branch_id: user.branch_id ?? undefined,
  });
  const newRefreshToken = signRefreshToken({ sub: user.id, jti });

  await prisma.refreshToken.create({
    data: { user_id: user.id, token: jti, expires_at: getRefreshExpiryDate() },
  });

  return { access_token: newAccessToken, refresh_token: newRefreshToken };
}

export async function logoutStaff(userId: string, jti: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { user_id: userId, token: jti, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

// ─── Patient (B2C) Auth ───────────────────────────────────────────────────────

export async function requestPatientOtp(input: PatientLoginInput) {
  // Normalise phone: strip +91 prefix or leading 0
  const phone = input.phone.replace(/^\+91/, '').replace(/^0/, '').replace(/\s/g, '');

  let patientAuth = await prisma.patientAuth.findUnique({ where: { phone } });

  if (!patientAuth) {
    // Check if a patient record already exists by phone (registered via HMS)
    let patient = await prisma.patient.findFirst({ where: { phone } });

    if (!patient) {
      // Brand-new registration from B2C portal
      if (!input.name) {
        throw new AppError('Account not found. Please enter your name to register.', 404);
      }

      // B2C patients use the first active branch as their home branch
      const branch = await prisma.branch.findFirst({ where: { is_active: true } });
      if (!branch) {
        throw new AppError('No active hospital found on this platform.', 503);
      }

      const nameParts = input.name.trim().split(' ');
      patient = await prisma.patient.create({
        data: {
          branch_id: branch.id,
          uhid: `B2C-${phone}`,
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' ') || '',
          phone,
          gender: 'OTHER',
        },
      });
    }

    patientAuth = await prisma.patientAuth.create({
      data: { patient_id: patient.id, phone },
    });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL * 1000);

  await prisma.patientAuth.update({
    where: { id: patientAuth.id },
    data: { otp, otp_expires: expiresAt },
  });

  // Store OTP in Redis (if available), DB is the fallback
  await cache.set(`otp:${phone}`, otp, OTP_TTL);

  // TODO: Send OTP via SMS (MSG91 / Twilio)
  const isDev = process.env.NODE_ENV !== 'production';
  return {
    message: 'OTP sent successfully',
    expires_in: OTP_TTL,
    // Expose OTP only in development so the frontend can auto-fill during testing
    ...(isDev ? { dev_otp: otp } : {}),
  };
}

export async function verifyPatientOtp(input: VerifyOtpInput) {
  // Same normalisation as requestPatientOtp
  const phone = input.phone.replace(/^\+91/, '').replace(/^0/, '').replace(/\s/g, '');

  // Verify OTP from Redis cache or fall back to DB record
  const cachedOtp = await cache.get<string>(`otp:${phone}`);
  const patientAuthForOtp = await prisma.patientAuth.findUnique({ where: { phone } });
  const isValid = cachedOtp
    ? cachedOtp === input.otp
    : (patientAuthForOtp?.otp === input.otp && patientAuthForOtp.otp_expires && patientAuthForOtp.otp_expires > new Date());
  if (!isValid) {
    throw new AppError('Invalid or expired OTP', 401);
  }

  const patientAuth = await prisma.patientAuth.findUnique({
    where: { phone },
    include: { patient: true },
  });

  if (!patientAuth) throw new AppError('Patient not found', 404);

  await prisma.patientAuth.update({
    where: { id: patientAuth.id },
    data: { otp: null, otp_expires: null, is_verified: true },
  });

  await cache.del(`otp:${phone}`);

  const jti = crypto.randomUUID();
  const accessToken = signPatientToken({ sub: patientAuth.patient_id, phone });
  const refreshToken = signRefreshToken({ sub: patientAuth.patient_id, jti });

  await prisma.patientRefreshToken.create({
    data: { patient_auth_id: patientAuth.id, token: jti, expires_at: getRefreshExpiryDate() },
  });

  const p = patientAuth.patient;
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    patient: {
      id: p.id,
      name: `${p.first_name} ${p.last_name}`.trim(),
      phone,
      email: p.email,
      uhid: p.uhid,
    },
  };
}
