import { AdmissionStatus, AssessmentMode, Prisma } from "@prisma/client";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  admissionConfirmSchema,
  admissionDecisionSchema,
  admissionDraftSchema,
  admissionDuplicatesQuerySchema,
  admissionListQuerySchema,
  documentUploadSchema,
} from "@wellrun/shared";
import { audit } from "../common/audit";
import { assertWritableSchool } from "../common/school";
import { nextSchoolNumber } from "../common/sequence";
import { saveDataUrl } from "../common/uploads";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_DOCS = [
  { kind: "birth_certificate", label: "Birth certificate", required: true },
  { kind: "cnic", label: "Parent CNIC copy", required: true },
  { kind: "photos", label: "Photographs", required: true },
  { kind: "report_card", label: "Last report card", required: false },
  { kind: "transfer", label: "Transfer certificate", required: false },
];

@Injectable()
export class AdmissionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(schoolId: string) {
    const groups = await this.prisma.admissionApplication.groupBy({
      by: ["status"],
      where: { schoolId },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(groups.map((row) => [row.status, row._count._all])) as Record<string, number>;
    const total = groups.reduce((sum, row) => sum + row._count._all, 0);
    const open = total - (counts.ADMISSION_CONFIRMED ?? 0) - (counts.REJECTED ?? 0) - (counts.WITHDRAWN ?? 0);
    return {
      total,
      open,
      draft: counts.DRAFT ?? 0,
      submitted: counts.SUBMITTED ?? 0,
      underReview: counts.UNDER_REVIEW ?? 0,
      assessmentPending: counts.ASSESSMENT_PENDING ?? 0,
      interviewPending: counts.INTERVIEW_PENDING ?? 0,
      accepted: counts.ACCEPTED ?? 0,
      feePending: counts.FEE_PENDING ?? 0,
      documentsPending: counts.DOCUMENTS_PENDING ?? 0,
      waitlisted: counts.WAITLISTED ?? 0,
      rejected: counts.REJECTED ?? 0,
      confirmed: counts.ADMISSION_CONFIRMED ?? 0,
      withdrawn: counts.WITHDRAWN ?? 0,
    };
  }

  async list(schoolId: string, query: Record<string, string | undefined>) {
    const filters = admissionListQuerySchema.parse(query);
    const where: Prisma.AdmissionApplicationWhereInput = { schoolId };
    if (filters.status && filters.status !== "all") {
      where.status = filters.status as AdmissionStatus;
    }
    if (filters.campusId) where.campusId = filters.campusId;
    if (filters.className) where.className = filters.className;
    if (filters.yearId) where.yearId = filters.yearId;
    const q = filters.q?.trim();
    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { applicationNo: { contains: q, mode: "insensitive" } },
        { cnic: { contains: q, mode: "insensitive" } },
        { guardian: { name: { contains: q, mode: "insensitive" } } },
        { guardian: { phone: { contains: q, mode: "insensitive" } } },
        { guardian: { cnic: { contains: q, mode: "insensitive" } } },
      ];
    }
    const [total, rows, years, campuses, classes] = await Promise.all([
      this.prisma.admissionApplication.count({ where }),
      this.prisma.admissionApplication.findMany({
        where,
        include: {
          guardian: true,
          campus: true,
          scores: true,
          invoices: { include: { payments: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.academicYear.findMany({ where: { schoolId }, orderBy: { startsOn: "desc" } }),
      this.prisma.campus.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } }),
      this.prisma.class.findMany({
        where: { schoolId },
        include: { year: true, campus: true },
        orderBy: [{ name: "asc" }, { section: "asc" }],
      }),
    ]);
    const docs = await this.prisma.schoolDocument.findMany({
      where: { schoolId, ownerType: "application", ownerId: { in: rows.map((row) => row.id) } },
    });
    const docsByOwner = new Map<string, typeof docs>();
    for (const doc of docs) {
      const list = docsByOwner.get(doc.ownerId) ?? [];
      list.push(doc);
      docsByOwner.set(doc.ownerId, list);
    }
    return {
      items: rows.map((row) => {
        const ownerDocs = docsByOwner.get(row.id) ?? [];
        return this.toListRow(row, ownerDocs);
      }),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      years: years.map((year) => ({ id: year.id, name: year.name, current: year.current })),
      campuses: campuses.map((campus) => ({ id: campus.id, name: campus.name })),
      classes: classes.map((cls) => ({
        id: cls.id,
        name: cls.name,
        section: cls.section,
        yearId: cls.yearId,
        campusId: cls.campusId,
      })),
    };
  }

  async create(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = admissionDraftSchema.parse(body ?? {});
    const year = data.yearId
      ? await this.prisma.academicYear.findFirst({ where: { id: data.yearId, schoolId } })
      : await this.prisma.academicYear.findFirst({ where: { schoolId, current: true } });
    const campus = data.campusId
      ? await this.prisma.campus.findFirst({ where: { id: data.campusId, schoolId } })
      : await this.prisma.campus.findFirst({ where: { schoolId, isMain: true } });
    let studentId = data.studentId;
    let studentType = data.studentType ?? "new";
    if (studentId) {
      const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId } });
      if (!student) throw new BadRequestException("Student not found for re-admission");
      studentType = "returning";
    }
    const application = await this.prisma.$transaction(async (tx) => {
      const applicationNo = await nextSchoolNumber(tx, schoolId, "APP");
      return tx.admissionApplication.create({
        data: {
          schoolId,
          applicationNo,
          studentId,
          studentType,
          firstName: data.firstName ?? (studentId ? undefined : "") ?? "",
          lastName: data.lastName ?? "",
          yearId: year?.id,
          campusId: campus?.id,
          className: data.className ?? "",
          section: data.section ?? "A",
          targetClassId: data.targetClassId,
          guardianId: data.guardianId,
          family: data.family ?? {},
          extra: data.extra ?? {},
        },
      });
    });
    if (studentId) {
      const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId } });
      if (student) {
        await this.prisma.admissionApplication.update({
          where: { id: application.id },
          data: {
            firstName: student.firstName,
            lastName: student.lastName,
            gender: student.gender,
            dateOfBirth: student.dateOfBirth,
            photoUrl: this.extraText(student.extra, "photo"),
            address: this.extraText(student.extra, "address"),
          },
        });
      }
    }
    await this.ensureDocuments(schoolId, application.id);
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "application_created",
      entity: "admission",
      entityId: application.id,
      summary: application.applicationNo,
    });
    return this.byId(schoolId, application.id);
  }

  async byId(schoolId: string, id: string) {
    const application = await this.prisma.admissionApplication.findFirst({
      where: { id, schoolId },
      include: {
        guardian: true,
        campus: true,
        year: true,
        targetClass: true,
        student: true,
        scores: true,
        invoices: { include: { payments: true, feePlan: true } },
      },
    });
    if (!application) throw new NotFoundException("Application not found");
    const documents = await this.prisma.schoolDocument.findMany({
      where: { schoolId, ownerType: "application", ownerId: id },
      orderBy: { createdAt: "asc" },
    });
    const feeItems = await this.prisma.feeItem.findMany({
      where: { schoolId, enabled: true },
      orderBy: { sortOrder: "asc" },
    });
    const classes = await this.prisma.class.findMany({
      where: { schoolId },
      include: { year: true, campus: true },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    });
    const campuses = await this.prisma.campus.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } });
    const years = await this.prisma.academicYear.findMany({ where: { schoolId }, orderBy: { startsOn: "desc" } });
    const blockers = this.blockers(application, documents);
    return {
      ...this.toDetail(application, documents, blockers),
      feeItems: feeItems.map((item) => ({ id: item.id, name: item.name, amountPkr: item.amountPkr })),
      classes: classes.map((cls) => ({
        id: cls.id,
        name: cls.name,
        section: cls.section,
        yearId: cls.yearId,
        campusId: cls.campusId,
        yearName: cls.year.name,
        campusName: cls.campus?.name ?? "",
      })),
      campuses: campuses.map((campus) => ({ id: campus.id, name: campus.name })),
      years: years.map((year) => ({ id: year.id, name: year.name, current: year.current })),
    };
  }

  async patch(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const current = await this.requireApplication(schoolId, id);
    if (current.status === "ADMISSION_CONFIRMED" || current.status === "REJECTED" || current.status === "WITHDRAWN") {
      throw new BadRequestException("This application can no longer be edited");
    }
    const data = admissionDraftSchema.parse(body ?? {});
    const update: Prisma.AdmissionApplicationUpdateInput = {};
    const scalarKeys = [
      "firstName",
      "lastName",
      "middleName",
      "gender",
      "cnic",
      "bloodGroup",
      "nationality",
      "address",
      "photoUrl",
      "className",
      "section",
      "studentType",
      "previousSchool",
      "previousClass",
      "previousYear",
      "previousResult",
      "previousPct",
      "transferNotes",
      "interviewer",
      "interviewNotes",
      "recommendation",
    ] as const;
    for (const key of scalarKeys) {
      if (data[key] !== undefined) (update as Record<string, unknown>)[key] = data[key];
    }
    if (data.dateOfBirth !== undefined) update.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    if (data.interviewAt !== undefined) update.interviewAt = data.interviewAt ? new Date(data.interviewAt) : null;
    if (data.extra) update.extra = data.extra;
    if (data.family) update.family = data.family;
    if (data.assessmentMode) update.assessmentMode = data.assessmentMode as AssessmentMode;
    if (data.yearId !== undefined) update.year = data.yearId ? { connect: { id: data.yearId } } : { disconnect: true };
    if (data.campusId !== undefined) {
      update.campus = data.campusId ? { connect: { id: data.campusId } } : { disconnect: true };
    }
    if (data.targetClassId !== undefined) {
      update.targetClass = data.targetClassId ? { connect: { id: data.targetClassId } } : { disconnect: true };
    }
    if (data.guardianId !== undefined) {
      update.guardian = data.guardianId ? { connect: { id: data.guardianId } } : { disconnect: true };
    }
    if (data.studentId !== undefined) {
      update.student = data.studentId ? { connect: { id: data.studentId } } : { disconnect: true };
      if (data.studentId) update.studentType = "returning";
    }
    await this.prisma.admissionApplication.update({ where: { id }, data: update });
    if (data.scores) {
      await this.prisma.admissionTestScore.deleteMany({ where: { applicationId: id } });
      if (data.scores.length) {
        await this.prisma.admissionTestScore.createMany({
          data: data.scores.map((score) => ({
            applicationId: id,
            subject: score.subject,
            maxMarks: score.maxMarks,
            obtainedMarks: score.obtainedMarks,
          })),
        });
      }
    }
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "application_updated",
      entity: "admission",
      entityId: id,
    });
    return this.byId(schoolId, id);
  }

  async submit(schoolId: string, actorId: string, id: string) {
    await assertWritableSchool(this.prisma, schoolId);
    const application = await this.requireApplication(schoolId, id, true);
    const missing = this.submitMissing(application);
    if (missing.length) throw new BadRequestException(`Complete required fields: ${missing.join(", ")}`);
    let status: AdmissionStatus = "SUBMITTED";
    if (application.assessmentMode === "TEST" || application.assessmentMode === "BOTH") {
      if (!application.scores.length) status = "ASSESSMENT_PENDING";
    }
    if (application.assessmentMode === "INTERVIEW" || application.assessmentMode === "BOTH") {
      if (!application.interviewNotes && status === "SUBMITTED") status = "INTERVIEW_PENDING";
    }
    await this.prisma.admissionApplication.update({
      where: { id },
      data: { status, submittedAt: new Date() },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "application_submitted",
      entity: "admission",
      entityId: id,
      summary: application.applicationNo,
    });
    return this.byId(schoolId, id);
  }

  async review(schoolId: string, actorId: string, id: string) {
    return this.setStatus(schoolId, actorId, id, "UNDER_REVIEW", "application_reviewed");
  }

  async accept(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = admissionDecisionSchema.parse(body ?? {});
    const application = await this.requireApplication(schoolId, id, true);
    await this.issueAdmissionInvoice(schoolId, application.id);
    const documents = await this.prisma.schoolDocument.findMany({
      where: { schoolId, ownerType: "application", ownerId: id },
    });
    const invoices = await this.prisma.invoice.findMany({
      where: { applicationId: id },
      include: { payments: true },
    });
    const feeDue = this.feeDue(invoices);
    const docsMissing = documents.filter((doc) => doc.required && !doc.url).length;
    let status: AdmissionStatus = "ACCEPTED";
    if (feeDue > 0) status = "FEE_PENDING";
    else if (docsMissing > 0) status = "DOCUMENTS_PENDING";
    await this.prisma.admissionApplication.update({
      where: { id },
      data: { status, decisionNote: data.note ?? application.decisionNote, decidedAt: new Date() },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "application_accepted",
      entity: "admission",
      entityId: id,
      summary: application.applicationNo,
    });
    return this.byId(schoolId, id);
  }

  async waitlist(schoolId: string, actorId: string, id: string, body: unknown) {
    const data = admissionDecisionSchema.parse(body ?? {});
    return this.setStatus(schoolId, actorId, id, "WAITLISTED", "application_waitlisted", data.note);
  }

  async reject(schoolId: string, actorId: string, id: string, body: unknown) {
    const data = admissionDecisionSchema.parse(body ?? {});
    return this.setStatus(schoolId, actorId, id, "REJECTED", "application_rejected", data.note);
  }

  async withdraw(schoolId: string, actorId: string, id: string, body: unknown) {
    const data = admissionDecisionSchema.parse(body ?? {});
    return this.setStatus(schoolId, actorId, id, "WITHDRAWN", "application_withdrawn", data.note);
  }

  async confirm(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = admissionConfirmSchema.parse(body ?? {});
    const application = await this.requireApplication(schoolId, id, true);
    if (application.status === "ADMISSION_CONFIRMED") throw new BadRequestException("Already confirmed");
    if (["REJECTED", "WITHDRAWN", "DRAFT"].includes(application.status)) {
      throw new BadRequestException("This application cannot be confirmed yet");
    }
    const family = this.familyRecord(application.family);
    const guardianId =
      application.guardianId ||
      (family.guardianName && family.guardianPhone
        ? await this.findOrCreateGuardian(schoolId, actorId, family)
        : null);
    if (!guardianId) throw new BadRequestException("Add a guardian before confirming");
    const classId = data.classId || application.targetClassId || (await this.resolveClassId(schoolId, application));
    if (!classId) throw new BadRequestException("Choose a class before confirming");
    const cls = await this.prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!cls) throw new BadRequestException("Class not found");
    const documents = await this.prisma.schoolDocument.findMany({
      where: { schoolId, ownerType: "application", ownerId: id },
    });
    const invoices = await this.prisma.invoice.findMany({
      where: { applicationId: id },
      include: { payments: true },
    });
    const blockers = this.blockers({ ...application, invoices, guardianId }, documents);
    if (blockers.length) throw new BadRequestException(blockers[0]);

    const result = await this.prisma.$transaction(async (tx) => {
      let studentId = application.studentId;
      const extra = {
        ...this.extraRecord(application.extra),
        phone: family.guardianPhone || "",
        address: application.address,
        cnic: application.cnic,
        photo: application.photoUrl,
      };
      if (!studentId) {
        const admissionNo = await nextSchoolNumber(tx, schoolId, "ADM");
        const student = await tx.student.create({
          data: {
            schoolId,
            campusId: cls.campusId,
            admissionNo,
            firstName: application.firstName,
            lastName: application.lastName,
            gender: application.gender || "unspecified",
            dateOfBirth: application.dateOfBirth,
            status: "active",
            extra,
          },
        });
        studentId = student.id;
      } else {
        await tx.student.update({
          where: { id: studentId },
          data: { status: "active", campusId: cls.campusId, extra },
        });
        await tx.enrollment.updateMany({
          where: { studentId, active: true },
          data: { active: false, status: "completed", endedAt: new Date() },
        });
      }
      const rollNo = await this.nextRollNo(tx, schoolId, cls.id);
      await tx.enrollment.create({
        data: {
          schoolId,
          studentId,
          classId: cls.id,
          active: true,
          rollNo,
          status: "active",
          studentType: application.studentType,
        },
      });
      await tx.student.update({ where: { id: studentId }, data: { rollNo, campusId: cls.campusId } });
      await tx.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId, guardianId } },
        update: {},
        create: { studentId, guardianId },
      });
      await tx.invoice.updateMany({ where: { applicationId: id }, data: { studentId } });
      const studentDocs = documents.filter((doc) => doc.url);
      for (const doc of studentDocs) {
        await tx.schoolDocument.create({
          data: {
            schoolId,
            ownerType: "student",
            ownerId: studentId,
            kind: doc.kind,
            label: doc.label,
            required: doc.required,
            url: doc.url,
            uploadedBy: actorId,
          },
        });
      }
      await tx.admissionApplication.update({
        where: { id },
        data: {
          status: "ADMISSION_CONFIRMED",
          studentId,
          guardianId,
          targetClassId: cls.id,
          confirmedAt: new Date(),
        },
      });
      return { studentId, rollNo };
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "admission_confirmed",
      entity: "student",
      entityId: result.studentId,
      summary: application.applicationNo,
    });
    return this.byId(schoolId, id);
  }

  async duplicates(schoolId: string, query: Record<string, string | undefined>) {
    const filters = admissionDuplicatesQuerySchema.parse(query);
    const matches: {
      kind: string;
      reason: string;
      student?: { id: string; admissionNo: string; firstName: string; lastName: string };
      application?: { id: string; applicationNo: string; firstName: string; lastName: string; status: string };
    }[] = [];
    if (filters.cnic?.trim()) {
      const cnic = filters.cnic.trim();
      const students = await this.prisma.student.findMany({
        where: { schoolId, extra: { path: ["cnic"], equals: cnic } },
        take: 5,
      });
      const apps = await this.prisma.admissionApplication.findMany({
        where: { schoolId, cnic, status: { notIn: ["REJECTED", "WITHDRAWN"] } },
        take: 5,
      });
      for (const student of students) {
        matches.push({
          kind: "student",
          reason: "Same CNIC as an enrolled student",
          student: {
            id: student.id,
            admissionNo: student.admissionNo,
            firstName: student.firstName,
            lastName: student.lastName,
          },
        });
      }
      for (const app of apps) {
        matches.push({
          kind: "application",
          reason: "Same CNIC as another application",
          application: {
            id: app.id,
            applicationNo: app.applicationNo,
            firstName: app.firstName,
            lastName: app.lastName,
            status: app.status,
          },
        });
      }
    }
    if (filters.phone?.trim() || filters.guardianPhone?.trim()) {
      const phone = (filters.guardianPhone || filters.phone || "").trim();
      const guardians = await this.prisma.guardian.findMany({
        where: { schoolId, phone },
        include: { students: { include: { student: true } } },
        take: 5,
      });
      for (const guardian of guardians) {
        for (const link of guardian.students) {
          matches.push({
            kind: "student",
            reason: "Same guardian phone",
            student: {
              id: link.student.id,
              admissionNo: link.student.admissionNo,
              firstName: link.student.firstName,
              lastName: link.student.lastName,
            },
          });
        }
      }
    }
    if (filters.firstName?.trim() && filters.lastName?.trim() && filters.dateOfBirth) {
      const day = new Date(`${filters.dateOfBirth}T00:00:00.000Z`);
      const next = new Date(day);
      next.setUTCDate(next.getUTCDate() + 1);
      const students = await this.prisma.student.findMany({
        where: {
          schoolId,
          firstName: { equals: filters.firstName.trim(), mode: "insensitive" },
          lastName: { equals: filters.lastName.trim(), mode: "insensitive" },
          dateOfBirth: { gte: day, lt: next },
        },
        take: 5,
      });
      for (const student of students) {
        matches.push({
          kind: "student",
          reason: "Same name and date of birth — review before continuing",
          student: {
            id: student.id,
            admissionNo: student.admissionNo,
            firstName: student.firstName,
            lastName: student.lastName,
          },
        });
      }
    }
    return { matches };
  }

  async uploadDocument(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    await this.requireApplication(schoolId, id);
    const data = documentUploadSchema.parse(body);
    const url = saveDataUrl(schoolId, `app-${id}-${data.kind}`, data.dataUrl);
    const existing = await this.prisma.schoolDocument.findFirst({
      where: { schoolId, ownerType: "application", ownerId: id, kind: data.kind },
    });
    if (existing) {
      await this.prisma.schoolDocument.update({
        where: { id: existing.id },
        data: { url, label: data.label, uploadedBy: actorId },
      });
    } else {
      await this.prisma.schoolDocument.create({
        data: {
          schoolId,
          ownerType: "application",
          ownerId: id,
          kind: data.kind,
          label: data.label,
          required: data.required ?? true,
          url,
          uploadedBy: actorId,
        },
      });
    }
    return this.byId(schoolId, id);
  }

  async removeDocument(schoolId: string, actorId: string, id: string, documentId: string) {
    await assertWritableSchool(this.prisma, schoolId);
    await this.requireApplication(schoolId, id);
    const doc = await this.prisma.schoolDocument.findFirst({
      where: { id: documentId, schoolId, ownerType: "application", ownerId: id },
    });
    if (!doc) throw new NotFoundException("Document not found");
    await this.prisma.schoolDocument.update({ where: { id: documentId }, data: { url: "", uploadedBy: actorId } });
    return this.byId(schoolId, id);
  }

  async refreshStatus(schoolId: string, id: string) {
    const application = await this.requireApplication(schoolId, id, true);
    if (!["FEE_PENDING", "DOCUMENTS_PENDING", "ACCEPTED"].includes(application.status)) {
      return this.byId(schoolId, id);
    }
    const documents = await this.prisma.schoolDocument.findMany({
      where: { schoolId, ownerType: "application", ownerId: id },
    });
    const feeDue = this.feeDue(application.invoices);
    const docsMissing = documents.filter((doc) => doc.required && !doc.url).length;
    let status: AdmissionStatus = "ACCEPTED";
    if (feeDue > 0) status = "FEE_PENDING";
    else if (docsMissing > 0) status = "DOCUMENTS_PENDING";
    if (status !== application.status) {
      await this.prisma.admissionApplication.update({ where: { id }, data: { status } });
    }
    return this.byId(schoolId, id);
  }

  private async setStatus(
    schoolId: string,
    actorId: string,
    id: string,
    status: AdmissionStatus,
    action: string,
    note?: string,
  ) {
    await assertWritableSchool(this.prisma, schoolId);
    await this.requireApplication(schoolId, id);
    await this.prisma.admissionApplication.update({
      where: { id },
      data: { status, decisionNote: note, decidedAt: new Date() },
    });
    await audit(this.prisma, { schoolId, actorId, action, entity: "admission", entityId: id });
    return this.byId(schoolId, id);
  }

  private async requireApplication(schoolId: string, id: string, withRelations = false) {
    const application = await this.prisma.admissionApplication.findFirst({
      where: { id, schoolId },
      include: withRelations
        ? { scores: true, invoices: { include: { payments: true } }, guardian: true }
        : undefined,
    });
    if (!application) throw new NotFoundException("Application not found");
    return application;
  }

  private async ensureDocuments(schoolId: string, applicationId: string) {
    const existing = await this.prisma.schoolDocument.count({
      where: { schoolId, ownerType: "application", ownerId: applicationId },
    });
    if (existing) return;
    await this.prisma.schoolDocument.createMany({
      data: DEFAULT_DOCS.map((doc) => ({
        schoolId,
        ownerType: "application",
        ownerId: applicationId,
        ...doc,
      })),
    });
  }

  private async issueAdmissionInvoice(schoolId: string, applicationId: string) {
    const existing = await this.prisma.invoice.findFirst({ where: { applicationId } });
    if (existing) return existing;
    const items = await this.prisma.feeItem.findMany({ where: { schoolId, enabled: true }, orderBy: { sortOrder: "asc" } });
    const amount = items.reduce((sum, item) => sum + item.amountPkr, 0);
    if (!amount) return null;
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId, current: true } });
    if (!year) return null;
    let plan = await this.prisma.feePlan.findFirst({ where: { schoolId, yearId: year.id, name: "Admission fee" } });
    if (!plan) {
      plan = await this.prisma.feePlan.create({
        data: { schoolId, yearId: year.id, name: "Admission fee", amountPkr: amount },
      });
    }
    return this.prisma.invoice.create({
      data: {
        schoolId,
        applicationId,
        feePlanId: plan.id,
        amountPkr: amount,
        status: "ISSUED",
        dueOn: new Date(),
      },
    });
  }

  private async resolveClassId(
    schoolId: string,
    application: { targetClassId: string | null; className: string; section: string; yearId: string | null },
  ) {
    if (application.targetClassId) return application.targetClassId;
    if (!application.className) return null;
    const cls = await this.prisma.class.findFirst({
      where: {
        schoolId,
        name: application.className,
        section: application.section || "A",
        ...(application.yearId ? { yearId: application.yearId } : {}),
      },
    });
    return cls?.id ?? null;
  }

  private async nextRollNo(tx: Prisma.TransactionClient, schoolId: string, classId: string) {
    const enrolled = await tx.enrollment.findMany({
      where: { schoolId, classId, active: true },
      select: { rollNo: true },
    });
    const used = enrolled.map((row) => Number.parseInt(row.rollNo, 10)).filter((value) => Number.isFinite(value));
    return String((used.length ? Math.max(...used) : 0) + 1);
  }

  private async findOrCreateGuardian(
    schoolId: string,
    actorId: string,
    family: Record<string, string>,
  ) {
    const phone = family.guardianPhone;
    const cnic = family.guardianCnic || "";
    const existing = await this.prisma.guardian.findFirst({
      where: { schoolId, OR: [{ phone }, ...(cnic ? [{ cnic }] : [])] },
    });
    if (existing) return existing.id;
    const guardian = await this.prisma.guardian.create({
      data: {
        schoolId,
        name: family.guardianName,
        phone,
        cnic,
        email: family.guardianEmail || null,
        relation: family.guardianRelation || "Parent",
        occupation: family.guardianOccupation || "",
      },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "guardian_created",
      entity: "guardian",
      entityId: guardian.id,
    });
    return guardian.id;
  }

  private submitMissing(application: {
    firstName: string;
    lastName: string;
    dateOfBirth: Date | null;
    gender: string;
    className: string;
    guardianId: string | null;
    family: unknown;
  }) {
    const family = this.familyRecord(application.family);
    const missing: string[] = [];
    if (!application.firstName.trim()) missing.push("first name");
    if (!application.lastName.trim()) missing.push("last name");
    if (!application.dateOfBirth) missing.push("date of birth");
    if (!application.gender.trim()) missing.push("gender");
    if (!application.className.trim()) missing.push("class");
    if (!application.guardianId && !(family.guardianName && family.guardianPhone)) missing.push("guardian");
    return missing;
  }

  private blockers(
    application: {
      firstName: string;
      lastName: string;
      className: string;
      targetClassId: string | null;
      guardianId: string | null;
      invoices: { amountPkr: number; payments: { amountPkr: number }[]; status: string }[];
    },
    documents: { required: boolean; url: string }[],
  ) {
    const issues: string[] = [];
    if (!application.firstName || !application.lastName) issues.push("Applicant name is incomplete");
    if (!application.targetClassId && !application.className) issues.push("Choose a class");
    if (!application.guardianId) issues.push("Add a guardian");
    if (this.feeDue(application.invoices) > 0) issues.push("Admission fee is still due");
    if (documents.some((doc) => doc.required && !doc.url)) issues.push("Required documents are missing");
    return issues;
  }

  private feeDue(invoices: { amountPkr: number; payments: { amountPkr: number }[]; status: string }[]) {
    let pending = 0;
    for (const invoice of invoices) {
      if (invoice.status === "VOID" || invoice.status === "DRAFT") continue;
      const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountPkr, 0);
      pending += Math.max(invoice.amountPkr - paid, 0);
    }
    return pending;
  }

  private assessmentPct(scores: { maxMarks: number; obtainedMarks: number }[]) {
    const max = scores.reduce((sum, row) => sum + row.maxMarks, 0);
    const obtained = scores.reduce((sum, row) => sum + row.obtainedMarks, 0);
    return max ? Math.round((obtained / max) * 100) : null;
  }

  private nextAction(status: AdmissionStatus) {
    const map: Record<AdmissionStatus, string> = {
      DRAFT: "Continue application",
      SUBMITTED: "Start review",
      UNDER_REVIEW: "Accept, waitlist, or reject",
      ASSESSMENT_PENDING: "Enter test scores",
      INTERVIEW_PENDING: "Log interview",
      ACCEPTED: "Confirm admission",
      WAITLISTED: "Accept or reject from waitlist",
      REJECTED: "Closed",
      FEE_PENDING: "Record admission fee",
      DOCUMENTS_PENDING: "Upload required documents",
      ADMISSION_CONFIRMED: "Open student record",
      WITHDRAWN: "Closed",
    };
    return map[status];
  }

  private familyRecord(family: unknown) {
    if (!family || typeof family !== "object" || Array.isArray(family)) return {} as Record<string, string>;
    return Object.fromEntries(
      Object.entries(family as Record<string, unknown>).map(([key, value]) => [key, value == null ? "" : String(value)]),
    );
  }

  private extraRecord(extra: unknown) {
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) return {} as Record<string, string>;
    return Object.fromEntries(
      Object.entries(extra as Record<string, unknown>).map(([key, value]) => [key, value == null ? "" : String(value)]),
    );
  }

  private extraText(extra: unknown, key: string) {
    return this.extraRecord(extra)[key] ?? "";
  }

  private toListRow(
    row: {
      id: string;
      applicationNo: string;
      status: AdmissionStatus;
      firstName: string;
      lastName: string;
      className: string;
      section: string;
      createdAt: Date;
      campus: { name: string } | null;
      guardian: { name: string; phone: string } | null;
      scores: { maxMarks: number; obtainedMarks: number }[];
      invoices: { amountPkr: number; payments: { amountPkr: number }[]; status: string }[];
    },
    documents: { required: boolean; url: string }[],
  ) {
    const uploaded = documents.filter((doc) => doc.url).length;
    return {
      id: row.id,
      applicationNo: row.applicationNo,
      status: row.status,
      firstName: row.firstName,
      lastName: row.lastName,
      className: row.className,
      section: row.section,
      campus: row.campus?.name ?? "",
      guardianName: row.guardian?.name ?? "",
      guardianPhone: row.guardian?.phone ?? "",
      createdAt: row.createdAt,
      assessmentPct: this.assessmentPct(row.scores),
      docs: { uploaded, total: documents.length },
      feeDue: this.feeDue(row.invoices),
      nextAction: this.nextAction(row.status),
    };
  }

  private toDetail(
    application: {
      id: string;
      applicationNo: string;
      status: AdmissionStatus;
      firstName: string;
      lastName: string;
      middleName: string;
      gender: string;
      dateOfBirth: Date | null;
      cnic: string;
      bloodGroup: string;
      nationality: string;
      address: string;
      photoUrl: string;
      extra: unknown;
      yearId: string | null;
      campusId: string | null;
      className: string;
      section: string;
      targetClassId: string | null;
      studentType: string;
      previousSchool: string;
      previousClass: string;
      previousYear: string;
      previousResult: string;
      previousPct: string;
      transferNotes: string;
      guardianId: string | null;
      studentId: string | null;
      family: unknown;
      assessmentMode: AssessmentMode;
      interviewAt: Date | null;
      interviewer: string;
      interviewNotes: string;
      recommendation: string;
      decisionNote: string;
      submittedAt: Date | null;
      decidedAt: Date | null;
      confirmedAt: Date | null;
      createdAt: Date;
      guardian: { id: string; name: string; phone: string; cnic: string; relation: string } | null;
      campus: { id: string; name: string } | null;
      year: { id: string; name: string } | null;
      targetClass: { id: string; name: string; section: string } | null;
      student: { id: string; admissionNo: string } | null;
      scores: { id: string; subject: string; maxMarks: number; obtainedMarks: number }[];
      invoices: {
        id: string;
        amountPkr: number;
        status: string;
        dueOn: Date;
        feePlan: { name: string };
        payments: { id: string; amountPkr: number }[];
      }[];
    },
    documents: { id: string; kind: string; label: string; required: boolean; url: string }[],
    blockers: string[],
  ) {
    return {
      id: application.id,
      applicationNo: application.applicationNo,
      status: application.status,
      firstName: application.firstName,
      lastName: application.lastName,
      middleName: application.middleName,
      gender: application.gender,
      dateOfBirth: application.dateOfBirth,
      cnic: application.cnic,
      bloodGroup: application.bloodGroup,
      nationality: application.nationality,
      address: application.address,
      photoUrl: application.photoUrl,
      extra: this.extraRecord(application.extra),
      yearId: application.yearId,
      campusId: application.campusId,
      className: application.className,
      section: application.section,
      targetClassId: application.targetClassId,
      studentType: application.studentType,
      previousSchool: application.previousSchool,
      previousClass: application.previousClass,
      previousYear: application.previousYear,
      previousResult: application.previousResult,
      previousPct: application.previousPct,
      transferNotes: application.transferNotes,
      guardianId: application.guardianId,
      studentId: application.studentId,
      family: this.familyRecord(application.family),
      assessmentMode: application.assessmentMode,
      interviewAt: application.interviewAt,
      interviewer: application.interviewer,
      interviewNotes: application.interviewNotes,
      recommendation: application.recommendation,
      decisionNote: application.decisionNote,
      submittedAt: application.submittedAt,
      decidedAt: application.decidedAt,
      confirmedAt: application.confirmedAt,
      createdAt: application.createdAt,
      guardian: application.guardian,
      campus: application.campus,
      year: application.year,
      targetClass: application.targetClass,
      student: application.student,
      scores: application.scores.map((score) => ({
        ...score,
        pct: score.maxMarks ? Math.round((score.obtainedMarks / score.maxMarks) * 100) : 0,
      })),
      assessmentPct: this.assessmentPct(application.scores),
      documents,
      invoices: application.invoices.map((invoice) => {
        const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountPkr, 0);
        return {
          id: invoice.id,
          name: invoice.feePlan.name,
          amountPkr: invoice.amountPkr,
          paidPkr: paid,
          status: invoice.status,
          dueOn: invoice.dueOn,
          receiptId: invoice.payments[0]?.id ?? null,
        };
      }),
      blockers,
      nextAction: this.nextAction(application.status),
    };
  }
}
