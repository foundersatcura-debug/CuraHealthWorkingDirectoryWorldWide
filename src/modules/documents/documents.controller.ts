import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated, sendNotFound } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { AuthenticatedRequest } from '../../types';

export async function list(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const patient_id = req.query.patient_id as string | undefined;
  const tag = req.query.tag as string | undefined;

  const where = {
    ...(patient_id ? { patient_id } : {}),
    ...(tag ? { tag: tag as never } : {}),
  };

  const [documents, total] = await Promise.all([
    prisma.documentUpload.findMany({
      where,
      skip,
      take: limit,
      include: {
        patient: { select: { id: true, uhid: true, first_name: true, last_name: true } },
        uploader: { select: { first_name: true, last_name: true, role: true } },
      },
      orderBy: { upload_date: 'desc' },
    }),
    prisma.documentUpload.count({ where }),
  ]);

  sendSuccess(res, documents, buildMeta(page, limit, total));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const doc = await prisma.documentUpload.findUnique({
    where: { id: req.params.id },
    include: {
      patient: true,
      uploader: { select: { first_name: true, last_name: true } },
    },
  });
  if (!doc) { sendNotFound(res, 'Document'); return; }
  sendSuccess(res, doc);
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { patient_id, visit_id, admission_id, file_url, file_name, file_type, file_size, tag } =
    req.body as Record<string, string | number>;

  const doc = await prisma.documentUpload.create({
    data: {
      patient_id: patient_id as string,
      visit_id: visit_id as string | undefined,
      admission_id: admission_id as string | undefined,
      uploaded_by_user_id: user.id,
      file_url: file_url as string,
      file_name: file_name as string | undefined,
      file_type: file_type as string | undefined,
      file_size: file_size ? Number(file_size) : undefined,
      tag: (tag as never) ?? 'OTHER',
    },
  });

  sendCreated(res, doc);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await prisma.documentUpload.delete({ where: { id: req.params.id } });
  sendSuccess(res, { message: 'Document deleted' });
}

export async function getPatientDocuments(req: Request, res: Response): Promise<void> {
  const { patient_id } = req.params;
  const tag = req.query.tag as string | undefined;

  const documents = await prisma.documentUpload.findMany({
    where: {
      patient_id,
      ...(tag ? { tag: tag as never } : {}),
    },
    include: {
      uploader: { select: { first_name: true, last_name: true, role: true } },
    },
    orderBy: { upload_date: 'desc' },
  });

  sendSuccess(res, documents);
}
