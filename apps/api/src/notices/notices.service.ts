import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { noticeSchema, noticeUpdateSchema, pageParams, type NoticeView } from "@wellrun/shared";
import { audit } from "../common/audit";
import type { CurrentUser } from "../common/current-user";
import type { TeacherScope } from "../exams/access";
import { PrismaService } from "../prisma/prisma.service";

export type NoticeListQuery = { page?: string; pageSize?: string };

const select = {
  id: true,
  title: true,
  body: true,
  audience: true,
  classIds: true,
  pinned: true,
  publishedAt: true,
  createdBy: { select: { name: true } },
} satisfies Prisma.NoticeSelect;

type Row = Prisma.NoticeGetPayload<{ select: typeof select }>;

const idsOf = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

@Injectable()
export class NoticesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async views(schoolId: string, rows: Row[]): Promise<NoticeView[]> {
    const wanted = [...new Set(rows.flatMap((row) => idsOf(row.classIds)))];
    const classes = wanted.length
      ? await this.prisma.class.findMany({ where: { schoolId, id: { in: wanted } }, select: { id: true, name: true, section: true } })
      : [];
    const label = new Map(classes.map((cls) => [cls.id, `${cls.name} ${cls.section}`.trim()]));
    return rows.map((row) => {
      const classIds = idsOf(row.classIds);
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        audience: row.audience,
        classIds,
        classLabels: classIds.map((id) => label.get(id)).filter((name): name is string => Boolean(name)),
        pinned: row.pinned,
        publishedAt: row.publishedAt.toISOString(),
        author: row.createdBy?.name ?? null,
      };
    });
  }

  /** Admins see every notice; a teacher sees school-wide notices and those sent to a class they teach. */
  async list(schoolId: string, campusId: string | undefined, scope: TeacherScope, query: NoticeListQuery) {
    const { page, pageSize, skip, take } = pageParams(query, 20);
    const and: Prisma.NoticeWhereInput[] = [];
    if (campusId) and.push({ OR: [{ campusId }, { campusId: null }] });
    if (scope) {
      const mine = [...scope.classIds];
      and.push({ OR: [{ audience: "ALL" }, ...mine.map((id) => ({ audience: "CLASSES" as const, classIds: { array_contains: [id] } }))] });
    }
    const where: Prisma.NoticeWhereInput = { schoolId, ...(and.length ? { AND: and } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.notice.findMany({ where, select, orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }, { id: "asc" }], skip, take }),
      this.prisma.notice.count({ where }),
    ]);
    return { items: await this.views(schoolId, rows), total, page, pageSize };
  }

  async create(schoolId: string, campusId: string | undefined, user: CurrentUser, body: unknown) {
    const data = noticeSchema.parse(body);
    const classIds = await this.checkClasses(schoolId, data.audience, data.classIds);
    const row = await this.prisma.notice.create({
      data: { schoolId, campusId: campusId ?? null, title: data.title, body: data.body, audience: data.audience, classIds, pinned: data.pinned, createdById: user.id },
      select,
    });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "notice_posted", entity: "notice", entityId: row.id, summary: data.title });
    return (await this.views(schoolId, [row]))[0]!;
  }

  async update(schoolId: string, user: CurrentUser, id: string, body: unknown) {
    const data = noticeUpdateSchema.parse(body);
    const current = await this.prisma.notice.findFirst({ where: { id, schoolId }, select: { audience: true, classIds: true } });
    if (!current) throw new NotFoundException("Notice not found");
    const audience = data.audience ?? current.audience;
    const classIds = await this.checkClasses(schoolId, audience, data.classIds ?? idsOf(current.classIds));
    const row = await this.prisma.notice.update({
      where: { id },
      data: { title: data.title, body: data.body, audience, classIds, pinned: data.pinned },
      select,
    });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "notice_updated", entity: "notice", entityId: id });
    return (await this.views(schoolId, [row]))[0]!;
  }

  async remove(schoolId: string, user: CurrentUser, id: string) {
    const found = await this.prisma.notice.findFirst({ where: { id, schoolId }, select: { id: true, title: true } });
    if (!found) throw new NotFoundException("Notice not found");
    await this.prisma.notice.delete({ where: { id } });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "notice_deleted", entity: "notice", entityId: id, summary: found.title });
    return { ok: true };
  }

  private async checkClasses(schoolId: string, audience: "ALL" | "CLASSES", classIds: string[]) {
    if (audience === "ALL") return [];
    const unique = [...new Set(classIds)];
    if (!unique.length) throw new BadRequestException("Pick at least one class, or send it to everyone");
    const found = await this.prisma.class.count({ where: { schoolId, id: { in: unique } } });
    if (found !== unique.length) throw new BadRequestException("One of the classes was not found");
    return unique;
  }
}
