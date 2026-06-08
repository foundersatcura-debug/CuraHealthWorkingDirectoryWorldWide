import { UserRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
        branch_id?: string;
        hospital_id?: string;
        email: string;
      };
    }
  }
}

export {};
