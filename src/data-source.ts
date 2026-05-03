import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import {
  Hospital, Branch, Department,
  Role, User, Patient,
  Ward, Bed, Admission,
  VitalsHistory, ClinicalNote,
  Prescription, PrescriptionItem, MedicationAdministration,
  PatientQueue, Invoice, Payment, AuditLog,
} from './entities';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASS ?? '',
  database: process.env.DB_NAME ?? 'cura_hms',
  synchronize: process.env.NODE_ENV === 'development', // NEVER true in production
  logging: process.env.NODE_ENV === 'development',
  entities: [
    Hospital, Branch, Department,
    Role, User, Patient,
    Ward, Bed, Admission,
    VitalsHistory, ClinicalNote,
    Prescription, PrescriptionItem, MedicationAdministration,
    PatientQueue, Invoice, Payment, AuditLog,
  ],
  migrations: ['src/migrations/**/*.ts'],
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
