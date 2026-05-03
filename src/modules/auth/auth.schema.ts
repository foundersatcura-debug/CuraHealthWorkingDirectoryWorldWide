import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['FOUNDER', 'SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PHARMACY', 'LAB_TECHNICIAN']).optional(),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'New password must be at least 8 characters'),
});

// Accept any 10-digit number (strips leading +91 / 0 before validation happens in service)
const phoneSchema = z.string().min(10, 'Phone number must be at least 10 digits').max(15);

export const patientLoginSchema = z.object({
  phone: phoneSchema,
  otp: z.string().length(6, 'OTP must be 6 digits').optional(),
  name: z.string().min(2).optional(),
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type PatientLoginInput = z.infer<typeof patientLoginSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
