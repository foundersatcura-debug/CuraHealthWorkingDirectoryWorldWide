import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;        // user_id
  role: string;
  branch_id?: string;
  hospital_id?: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;        // unique token id stored in DB
  type: 'refresh';
}

export interface PatientTokenPayload {
  sub: string;        // patient_id
  phone: string;
  type: 'patient_access';
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY,
  } as jwt.SignOptions);
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY,
  } as jwt.SignOptions);
}

export function signPatientToken(payload: Omit<PatientTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'patient_access' }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

export function decodeToken(token: string): jwt.JwtPayload | null {
  try {
    return jwt.decode(token) as jwt.JwtPayload;
  } catch {
    return null;
  }
}

export function getRefreshExpiryDate(): Date {
  const days = parseInt(env.JWT_REFRESH_EXPIRY.replace('d', ''));
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}
