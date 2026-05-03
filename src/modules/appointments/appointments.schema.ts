import { z } from 'zod';

export const createAppointmentSchema = z.object({
  patient_id: z.string().min(1),
  doctor_id: z.string().min(1),
  dept_id: z.string().optional(),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  appointment_time: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
  type: z.enum(['CONSULTATION', 'FOLLOW_UP', 'EMERGENCY', 'PROCEDURE', 'LAB_VISIT']).default('CONSULTATION'),
  chief_complaint: z.string().optional(),
  notes: z.string().optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  notes: z.string().optional(),
  cancel_reason: z.string().optional(),
});

export const appointmentQuerySchema = z.object({
  search: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  doctor_id: z.string().optional(),
  dept_id: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type AppointmentQuery = z.infer<typeof appointmentQuerySchema>;
