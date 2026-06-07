import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { env } from '../config/env';
import { verifyAccessToken } from '../utils/token';
import { logger } from '../utils/logger';
import { SOCKET_EVENTS } from '../types';

let io: SocketIOServer;

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Auth middleware for socket connections
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      // Allow unauthenticated for public queue display
      next();
      return;
    }

    try {
      const payload = verifyAccessToken(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as { sub: string; role: string; branch_id?: string } | undefined;
    logger.info(`Socket connected: ${socket.id} user=${user?.sub ?? 'anonymous'}`);

    // Staff join their branch room
    if (user?.branch_id) {
      void socket.join(`branch:${user.branch_id}`);
    }

    // Founder / SuperAdmin auto-join the superadmin dashboard room
    if (user?.role === 'FOUNDER' || user?.role === 'SUPER_ADMIN') {
      void socket.join('superadmin:dashboard');
      logger.debug(`Socket ${socket.id} joined superadmin:dashboard`);
    }

    // Patient joins their personal room
    socket.on('join:patient', (patientId: string) => {
      void socket.join(`patient:${patientId}`);
      logger.debug(`Socket ${socket.id} joined patient:${patientId}`);
    });

    // Join OPD queue room for live updates
    socket.on('join:queue', ({ doctorId, date }: { doctorId: string; date: string }) => {
      void socket.join(`queue:${doctorId}:${date}`);
    });

    // Join emergency room
    socket.on('join:emergency', (branchId: string) => {
      void socket.join(`emergency:${branchId}`);
    });

    // Ambulance tracking
    socket.on('ambulance:update', (data: { ambulanceId: string; location: unknown }) => {
      io.to(`ambulance:${data.ambulanceId}`).emit(SOCKET_EVENTS.AMBULANCE_LOCATION, data.location);
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

// Emitter helpers used by services
export const emit = {
  queueUpdate(doctorId: string, date: string, data: unknown): void {
    getIO().to(`queue:${doctorId}:${date}`).emit(SOCKET_EVENTS.QUEUE_UPDATE, data);
  },

  tokenCalled(doctorId: string, date: string, data: unknown): void {
    getIO().to(`queue:${doctorId}:${date}`).emit(SOCKET_EVENTS.QUEUE_TOKEN_CALLED, data);
  },

  emergencyNew(branchId: string, data: unknown): void {
    getIO().to(`emergency:${branchId}`).emit(SOCKET_EVENTS.EMERGENCY_NEW, data);
    // Push lightweight alert to superadmin dashboard
    getIO().to('superadmin:dashboard').emit(SOCKET_EVENTS.DASHBOARD_PRIORITY_ALERT, {
      type: 'EMERGENCY_NEW',
      branch_id: branchId,
      payload: data,
      ts: new Date().toISOString(),
    });
  },

  emergencyUpdate(branchId: string, data: unknown): void {
    getIO().to(`emergency:${branchId}`).emit(SOCKET_EVENTS.EMERGENCY_UPDATE, data);
    getIO().to('superadmin:dashboard').emit(SOCKET_EVENTS.DASHBOARD_STATS_UPDATE, {
      trigger: 'emergency_update',
      branch_id: branchId,
      ts: new Date().toISOString(),
    });
  },

  notifyUser(userId: string, data: unknown): void {
    getIO().to(`user:${userId}`).emit(SOCKET_EVENTS.NOTIFICATION_NEW, data);
  },

  notifyPatient(patientId: string, data: unknown): void {
    getIO().to(`patient:${patientId}`).emit(SOCKET_EVENTS.NOTIFICATION_NEW, data);
  },

  labResultReady(patientId: string, data: unknown): void {
    getIO().to(`patient:${patientId}`).emit(SOCKET_EVENTS.LAB_RESULT_READY, data);
  },

  bedStatusChanged(branchId: string, data: unknown): void {
    getIO().to(`branch:${branchId}`).emit(SOCKET_EVENTS.BED_STATUS_CHANGED, data);
    getIO().to('superadmin:dashboard').emit(SOCKET_EVENTS.DASHBOARD_STATS_UPDATE, {
      trigger: 'bed_status_changed',
      branch_id: branchId,
      ts: new Date().toISOString(),
    });
  },

  // Superadmin-specific emitters
  dashboardStatsUpdate(trigger: string, data?: unknown): void {
    getIO().to('superadmin:dashboard').emit(SOCKET_EVENTS.DASHBOARD_STATS_UPDATE, {
      trigger,
      payload: data,
      ts: new Date().toISOString(),
    });
  },

  dashboardPriorityAlert(alert: { type: string; severity: string; message: string; data?: unknown }): void {
    getIO().to('superadmin:dashboard').emit(SOCKET_EVENTS.DASHBOARD_PRIORITY_ALERT, {
      ...alert,
      ts: new Date().toISOString(),
    });
  },
};
