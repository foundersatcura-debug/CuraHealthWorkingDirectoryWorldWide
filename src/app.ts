import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';

import { env } from './config/env';
import { logger } from './utils/logger';
import { globalRateLimit } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';

// Core route modules
import { authRouter }           from './modules/auth/auth.routes';
import { patientsRouter }       from './modules/patients/patients.routes';
import { appointmentsRouter }   from './modules/appointments/appointments.routes';
import { doctorsRouter }        from './modules/doctors/doctors.routes';
import { departmentsRouter }    from './modules/departments/departments.routes';
import { ipdRouter }            from './modules/ipd/ipd.routes';
import { labRouter }            from './modules/laboratory/lab.routes';
import { pharmacyRouter }       from './modules/pharmacy/pharmacy.routes';
import { billingRouter }        from './modules/billing/billing.routes';
import { emergencyRouter }      from './modules/emergency/emergency.routes';
import { bloodBankRouter }      from './modules/blood-bank/bloodBank.routes';
import { medicalRecordsRouter } from './modules/medical-records/medicalRecords.routes';
import { analyticsRouter }      from './modules/analytics/analytics.routes';
import { notificationsRouter }  from './modules/notifications/notifications.routes';
import { hrRouter }             from './modules/hr/hr.routes';
import { superadminRouter }     from './modules/superadmin/superadmin.routes';
import { b2cRouter }            from './modules/b2c/b2c.routes';

// New feature route modules
import { vitalsRouter }         from './modules/vitals/vitals.routes';
import { queueRouter }          from './modules/queue/queue.routes';
import { referralsRouter }      from './modules/referrals/referrals.routes';
import { radiologyRouter }      from './modules/radiology/radiology.routes';
import { documentsRouter }      from './modules/documents/documents.routes';
import { insuranceRouter }      from './modules/insurance/insurance.routes';
import { labCatalogRouter }     from './modules/lab-catalog/labCatalog.routes';
import { inventoryRouter }      from './modules/inventory/inventory.routes';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), env.LOG_DIR);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const app = express();

// ─── Security & Compression ──────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: env.NODE_ENV === 'production',
}));
app.use(compression());

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: env.CORS_ORIGINS.split(',').map(o => o.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Logging ─────────────────────────────────────────────────────────────────
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (message) => logger.info(message.trim()) },
}));

// ─── Body Parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Rate Limiting ───────────────────────────────────────────────────────────
app.use(globalRateLimit);

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ─── API Routes ──────────────────────────────────────────────────────────────
const API = env.API_PREFIX;

// Core modules
app.use(`${API}/auth`,            authRouter);
app.use(`${API}/patients`,        patientsRouter);
app.use(`${API}/appointments`,    appointmentsRouter);
app.use(`${API}/doctors`,         doctorsRouter);
app.use(`${API}/departments`,     departmentsRouter);
app.use(`${API}/ipd`,             ipdRouter);
app.use(`${API}/laboratory`,      labRouter);
app.use(`${API}/pharmacy`,        pharmacyRouter);
app.use(`${API}/billing`,         billingRouter);
app.use(`${API}/emergency`,       emergencyRouter);
app.use(`${API}/blood-bank`,      bloodBankRouter);
app.use(`${API}/medical-records`, medicalRecordsRouter);
app.use(`${API}/analytics`,       analyticsRouter);
app.use(`${API}/notifications`,   notificationsRouter);
app.use(`${API}/hr`,              hrRouter);
app.use(`${API}/superadmin`,      superadminRouter);
app.use(`${API}/b2c`,             b2cRouter);

// New feature modules
app.use(`${API}/vitals`,          vitalsRouter);
app.use(`${API}/queue`,           queueRouter);
app.use(`${API}/referrals`,       referralsRouter);
app.use(`${API}/radiology`,       radiologyRouter);
app.use(`${API}/documents`,       documentsRouter);
app.use(`${API}/insurance`,       insuranceRouter);
app.use(`${API}/lab-catalog`,     labCatalogRouter);
app.use(`${API}/inventory`,       inventoryRouter);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use(errorHandler);

export { app };
