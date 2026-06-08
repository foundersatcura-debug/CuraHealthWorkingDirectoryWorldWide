import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated, sendNotFound } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';

export async function listTests(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const search = req.query.search as string | undefined;
  const category = req.query.category as string | undefined;

  const where = {
    is_active: true,
    ...(category ? { category } : {}),
    ...(search ? {
      OR: [
        { test_name: { contains: search, mode: 'insensitive' as const } },
        { test_code: { contains: search, mode: 'insensitive' as const } },
      ],
    } : {}),
  };

  const [tests, total] = await Promise.all([
    prisma.labTest.findMany({
      where,
      skip,
      take: limit,
      include: { parameters: true },
      orderBy: { test_name: 'asc' },
    }),
    prisma.labTest.count({ where }),
  ]);

  sendSuccess(res, tests, buildMeta(page, limit, total));
}

export async function getTest(req: Request, res: Response): Promise<void> {
  const test = await prisma.labTest.findUnique({
    where: { id: req.params.id },
    include: { parameters: true },
  });
  if (!test) { sendNotFound(res, 'Lab test'); return; }
  sendSuccess(res, test);
}

export async function createTest(req: Request, res: Response): Promise<void> {
  const { test_name, test_code, category, base_price, reference_range, description, parameters } =
    req.body as {
      test_name: string;
      test_code: string;
      category?: string;
      base_price?: number;
      reference_range?: string;
      description?: string;
      parameters?: Array<{ name: string; unit?: string; normal_range_min?: string; normal_range_max?: string }>;
    };

  const test = await prisma.labTest.create({
    data: {
      test_name,
      test_code,
      category,
      base_price: base_price ?? 0,
      reference_range,
      description,
      parameters: parameters?.length ? { createMany: { data: parameters } } : undefined,
    },
    include: { parameters: true },
  });

  sendCreated(res, test);
}

export async function updateTest(req: Request, res: Response): Promise<void> {
  const { parameters, ...testData } = req.body as Record<string, unknown>;
  const test = await prisma.labTest.update({
    where: { id: req.params.id },
    data: testData as object,
    include: { parameters: true },
  });
  sendSuccess(res, test);
}

export async function deleteTest(req: Request, res: Response): Promise<void> {
  await prisma.labTest.update({ where: { id: req.params.id }, data: { is_active: false } });
  sendSuccess(res, { message: 'Lab test deactivated' });
}

// ─── Lab Parameters ───────────────────────────────────────────────────────────

export async function listParameters(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const lab_test_id = req.query.lab_test_id as string | undefined;

  const [params, total] = await Promise.all([
    prisma.labParameter.findMany({
      where: { ...(lab_test_id ? { lab_test_id } : {}) },
      skip,
      take: limit,
      orderBy: { name: 'asc' },
    }),
    prisma.labParameter.count({ where: { ...(lab_test_id ? { lab_test_id } : {}) } }),
  ]);

  sendSuccess(res, params, buildMeta(page, limit, total));
}

export async function createParameter(req: Request, res: Response): Promise<void> {
  const param = await prisma.labParameter.create({ data: req.body });
  sendCreated(res, param);
}

export async function updateParameter(req: Request, res: Response): Promise<void> {
  const param = await prisma.labParameter.update({ where: { id: req.params.id }, data: req.body as object });
  sendSuccess(res, param);
}

export async function deleteParameter(req: Request, res: Response): Promise<void> {
  await prisma.labParameter.delete({ where: { id: req.params.id } });
  sendSuccess(res, { message: 'Parameter deleted' });
}
