import { Request } from 'express';
import { UserRole } from '@prisma/client';

// Extends Express Request with authenticated user context
export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: UserRole;
    branch_id?: string;
    hospital_id?: string;
    email: string;
  };
}

export interface PatientAuthenticatedRequest extends Request {
  patient: {
    id: string;
    phone: string;
  };
}

// Generic paginated response matching the frontend contract
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// Queue entry for OPD real-time updates
export interface QueueEntry {
  appointment_id: string;
  token_number: number;
  patient_name: string;
  doctor_id: string;
  status: string;
  estimated_wait_minutes?: number;
}

// Socket.io room namespaces
export const SOCKET_ROOMS = {
  branch: (branchId: string) => `branch:${branchId}`,
  doctor: (doctorId: string) => `doctor:${doctorId}`,
  patient: (patientId: string) => `patient:${patientId}`,
  queue: (doctorId: string, date: string) => `queue:${doctorId}:${date}`,
  emergency: (branchId: string) => `emergency:${branchId}`,
  ambulance: (ambulanceId: string) => `ambulance:${ambulanceId}`,
} as const;

// Socket.io event names
export const SOCKET_EVENTS = {
  // Queue events
  QUEUE_UPDATE: 'queue:update',
  QUEUE_TOKEN_CALLED: 'queue:token_called',
  // Emergency events
  EMERGENCY_NEW: 'emergency:new',
  EMERGENCY_UPDATE: 'emergency:update',
  // Notification events
  NOTIFICATION_NEW: 'notification:new',
  // Bed events
  BED_STATUS_CHANGED: 'bed:status_changed',
  // Lab events
  LAB_RESULT_READY: 'lab:result_ready',
  // Ambulance events
  AMBULANCE_LOCATION: 'ambulance:location',
} as const;

// Appointment status transitions — enforced server-side
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  SCHEDULED: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: ['SCHEDULED'],
};
