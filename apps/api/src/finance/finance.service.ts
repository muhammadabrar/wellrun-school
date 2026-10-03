import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  DEFAULT_CATEGORIES,
  SYSTEM_CATEGORIES,
  accountSchema,
  accountUpdateSchema,
  categorySchema,
  categoryUpdateSchema,
  isoOf,
  pageParams,
  voucherCreateSchema,
  voucherVoidSchema,
  type FinanceAccountView,
  type FinanceCategoryView,
  type FinanceOverview,
  type LedgerView,
  type VoucherCreateInput,
  type VoucherList,
  type VoucherView,
} from "@wellrun/shared";
import { audit } from "../common/audit";
import { dateOnly, karachiToday } from "../common/date";
import { nextSchoolNumber } from "../common/sequence";
import { PrismaService } from "../prisma/prisma.service";
import { dateRange, endOf, karachiDay, monthName, monthsBetween, shiftMonth, startOf } from "../reports/helpers";
import { accountKindForMethod, accountLedger, balanceOn, dayBook, flowSummary, monthlyFlow, type AccountBasis, type LedgerEntry } from "./ledger";

type Tx = Prisma.TransactionClient;
type Db = PrismaService | Tx;

export type VoucherListQuery = { from?: string; to?: string; type?: string; accountId?: string; categoryId?: string; status?: string; q?: string; page?: string; pageSize?: string };
export type LedgerQuery = { accountId?: string; from?: string; to?: string; page?: string; pageSize?: string; export?: string };

const ROW_LIMIT = 100_000;
const LEDGER_EXPORT_LIMIT = 20_000;
const LEDGER_PAGE_SIZE = 50;

const voucherInclude = {
  account: { select: { name: true } },
  toAccount: { select: { name: true } },
  category: { select: { name: true } },
} satisfies Prisma.VoucherInclude;

type VoucherRow = Prisma.VoucherGetPayload<{ include: typeof voucherInclude }>;

@Injectable()
export class FinanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Setup ---------------------------------------------------------------------------------------------------

  /** A school's first visit gets a cash box, a bank account and the usual categories. Safe to call every time. */
  async ensureDefaults(schoolId: string) {
    const [accounts, categories] = await Promise.all([this.prisma.financeAccount.count({ where: { schoolId } }), this.prisma.financeCategory.count({ where: { schoolId } })]);
    if (!accounts) {
      const openingOn = dateOnly(karachiToday());
      await this.prisma.financeAccount.createMany({
        data: [
          { schoolId, name: "Cash in hand", kind: "CASH", openingOn, sortOrder: 0 },
          { schoolId, name: "Bank account", kind: "BANK", openingOn, sortOrder: 1 },
        ],
        skipDuplicates: true,
      });
    }
    if (!categories) {
      await this.prisma.financeCategory.createMany({
        data: [
          ...Object.values(SYSTEM_CATEGORIES).map((c) => ({ schoolId, name: c.name, kind: c.kind, systemKey: c.key })),
          ...DEFAULT_CATEGORIES.map((c) => ({ schoolId, name: c.name, kind: c.kind })),
        ],
        skipDuplicates: true,
      });
    }
  }

  /** The cash and bank accounts that fee payments and salaries are counted in: the first active one of each kind. */
  async defaultAccounts(schoolId: string, db: Db = this.prisma) {
    const active = await db.financeAccount.findMany({ where: { schoolId, active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, kind: true } });
    const cash = active.find((a) => a.kind === "CASH")?.id ?? null;
    const bank = active.find((a) => a.kind === "BANK")?.id ?? null;
    return { CASH: cash ?? bank, BANK: bank ?? cash };
  }

  // The book ------------------------------------------------------------------------------------------------

  /** Everything that moved money between two days: vouchers written by people, fee payments received, salaries paid. */
  async entries(schoolId: string, from: string, to: string): Promise<LedgerEntry[]> {
    const [defaults, vouchers, payments, payslips] = await Promise.all([
      this.defaultAccounts(schoolId),
      this.prisma.voucher.findMany({
        where: { schoolId, status: "POSTED", date: { gte: dateOnly(from), lte: dateOnly(to) } },
        take: ROW_LIMIT,
        include: { category: { select: { name: true } } },
      }),
      this.prisma.payment.findMany({
        where: { schoolId, status: "COMPLETED", method: { not: "credit" }, paymentDate: { gte: startOf(from), lte: endOf(to) } },
        take: ROW_LIMIT,
        select: { id: true, paymentDate: true, amountPkr: true, method: true, paymentNumber: true, receiptNo: true, student: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.payslip.findMany({
        where: { schoolId, status: "PAID", paidOn: { gte: startOf(from), lte: endOf(to) } },
        take: ROW_LIMIT,
        select: { id: true, paidOn: true, netPkr: true, method: true, payslipNo: true, period: true, staff: { select: { name: true } } },
      }),
    ]);
    const out: LedgerEntry[] = [];
    for (const v of vouchers) {
      out.push({
        date: isoOf(v.date),
        order: `${v.createdAt.toISOString()}${v.id}`,
        description: [v.party, v.note].filter(Boolean).join(": ") || v.category?.name || "Transfer",
        reference: v.number,
        category: v.category?.name ?? "Transfer",
        kind: v.type === "PAYMENT" ? "OUT" : v.type === "RECEIPT" ? "IN" : "TRANSFER",
        amountPkr: v.amountPkr,
        accountId: v.accountId,
        toAccountId: v.toAccountId,
        source: "VOUCHER",
        voucherId: v.id,
      });
    }
    for (const p of payments) {
      const accountId = defaults[accountKindForMethod(p.method)];
      if (!accountId) continue;
      const who = p.student ? `${p.student.firstName} ${p.student.lastName}`.trim() : "";
      out.push({
        date: karachiDay(p.paymentDate),
        order: `${p.paymentDate.toISOString()}${p.id}`,
        description: who ? `Fee payment: ${who}` : "Fee payment",
        reference: p.paymentNumber || p.receiptNo,
        category: SYSTEM_CATEGORIES.FEE_COLLECTION.name,
        kind: "IN",
        amountPkr: p.amountPkr,
        accountId,
        toAccountId: null,
        source: "FEE",
        voucherId: null,
      });
    }
    for (const s of payslips) {
      const accountId = defaults[accountKindForMethod(s.method)];
      if (!accountId || !s.paidOn) continue;
      out.push({
        date: karachiDay(s.paidOn),
        order: `${s.paidOn.toISOString()}${s.id}`,
        description: `Salary ${s.period}: ${s.staff.name}`,
        reference: s.payslipNo,
        category: SYSTEM_CATEGORIES.SALARIES.name,
        kind: "OUT",
        amountPkr: s.netPkr,
        accountId,
        toAccountId: null,
        source: "PAYROLL",
        voucherId: null,
      });
    }
    return out;
  }

  private basis(row: { id: string; name: string; openingBalancePkr: number; openingOn: Date }): AccountBasis {
    return { id: row.id, name: row.name, openingBalancePkr: row.openingBalancePkr, openingOn: isoOf(row.openingOn) };
  }

  private accountRows(schoolId: string) {
    return this.prisma.financeAccount.findMany({ where: { schoolId }, orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }] });
  }

  private withBalances(rows: Awaited<ReturnType<FinanceService["accountRows"]>>, entries: LedgerEntry[], today: string): FinanceAccountView[] {
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      openingBalancePkr: row.openingBalancePkr,
      openingOn: isoOf(row.openingOn),
      active: row.active,
      balancePkr: balanceOn(this.basis(row), entries, today),
    }));
  }

  async accounts(schoolId: string): Promise<FinanceAccountView[]> {
    await this.ensureDefaults(schoolId);
    const today = karachiToday();
    const rows = await this.accountRows(schoolId);
    const earliest = rows.reduce((min, r) => (isoOf(r.openingOn) < min ? isoOf(r.openingOn) : min), today);
    return this.withBalances(rows, await this.entries(schoolId, earliest, today), today);
  }

  async overview(schoolId: string): Promise<FinanceOverview> {
    await this.ensureDefaults(schoolId);
    const today = karachiToday();
    const month = today.slice(0, 7);
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
    const rows = await this.accountRows(schoolId);
    const earliest = rows.reduce((min, r) => (isoOf(r.openingOn) < min ? isoOf(r.openingOn) : min), `${months[0]}-01`);
    const entries = await this.entries(schoolId, earliest < `${months[0]}-01` ? earliest : `${months[0]}-01`, today);
    const accounts = this.withBalances(rows, entries, today);
    const flow = flowSummary(entries, `${month}-01`, today);
    const names = new Map(rows.map((r) => [r.id, r.name]));
    return {
      accounts,
      totalBalancePkr: accounts.filter((a) => a.active).reduce((sum, a) => sum + a.balancePkr, 0),
      month: { label: monthName(month), incomePkr: flow.incomePkr, expensePkr: flow.expensePkr, netPkr: flow.netPkr, byCategory: flow.byCategory },
      trend: monthlyFlow(entries, months).map((m) => ({ ...m, label: monthName(m.month) })),
      recent: dayBook(entries, `${months[0]}-01`, today, names).rows.slice(-8).reverse(),
    };
  }

  async ledger(schoolId: string, query: LedgerQuery): Promise<LedgerView> {
    await this.ensureDefaults(schoolId);
    const today = karachiToday();
    const { from, to } = dateRange(query, today);
    const exporting = query.export === "1";
    const { page, pageSize, skip, take } = exporting ? { page: 1, pageSize: LEDGER_EXPORT_LIMIT, skip: 0, take: LEDGER_EXPORT_LIMIT } : pageParams(query, LEDGER_PAGE_SIZE);
    const accounts = await this.accountRows(schoolId);
    const names = new Map(accounts.map((a) => [a.id, a.name]));
    const accountRow = query.accountId && query.accountId !== "all" ? accounts.find((a) => a.id === query.accountId) : null;
    if (query.accountId && query.accountId !== "all" && !accountRow) throw new NotFoundException("Account not found");

    let result: { openingPkr: number | null; closingPkr: number | null; totalInPkr: number; totalOutPkr: number; rows: LedgerView["rows"] };
    if (accountRow) {
      const basis = this.basis(accountRow);
      const entries = await this.entries(schoolId, basis.openingOn < from ? basis.openingOn : from, to);
      result = accountLedger(basis, entries, from, to, names);
    } else {
      const book = dayBook(await this.entries(schoolId, from, to), from, to, names);
      result = { openingPkr: null, closingPkr: null, ...book };
    }
    return {
      accountId: accountRow?.id ?? null,
      accountName: accountRow?.name ?? "All accounts",
      from,
      to,
      openingPkr: result.openingPkr,
      closingPkr: result.closingPkr,
      totalInPkr: result.totalInPkr,
      totalOutPkr: result.totalOutPkr,
      rows: result.rows.slice(skip, skip + take),
      total: result.rows.length,
      page,
      pageSize,
      truncated: result.rows.length > LEDGER_EXPORT_LIMIT && exporting,
    };
  }

  // Accounts and categories ---------------------------------------------------------------------------------

  async createAccount(schoolId: string, actorId: string, body: unknown) {
    const data = accountSchema.parse(body);
    if (await this.prisma.financeAccount.findUnique({ where: { schoolId_name: { schoolId, name: data.name } }, select: { id: true } })) throw new ConflictException("You already have an account with that name");
    const count = await this.prisma.financeAccount.count({ where: { schoolId } });
    const row = await this.prisma.financeAccount.create({ data: { schoolId, name: data.name, kind: data.kind, openingBalancePkr: data.openingBalancePkr, openingOn: dateOnly(data.openingOn), sortOrder: count } });
    await audit(this.prisma, { schoolId, actorId, action: "finance_account_created", entity: "finance_account", entityId: row.id, summary: row.name });
    return (await this.accounts(schoolId)).find((a) => a.id === row.id)!;
  }

  async updateAccount(schoolId: string, actorId: string, id: string, body: unknown) {
    const data = accountUpdateSchema.parse(body);
    const current = await this.prisma.financeAccount.findFirst({ where: { id, schoolId } });
    if (!current) throw new NotFoundException("Account not found");
    if (data.name && data.name !== current.name && (await this.prisma.financeAccount.findUnique({ where: { schoolId_name: { schoolId, name: data.name } }, select: { id: true } }))) {
      throw new ConflictException("You already have an account with that name");
    }
    if (data.active === false && current.active) {
      const others = await this.prisma.financeAccount.count({ where: { schoolId, kind: current.kind, active: true, id: { not: id } } });
      if (!others) throw new BadRequestException(`Keep at least one ${current.kind === "CASH" ? "cash" : "bank"} account switched on: fee payments and salaries are counted in it`);
    }
    if (data.openingOn) {
      const earlier = await this.prisma.voucher.findFirst({ where: { schoolId, status: "POSTED", date: { lt: dateOnly(data.openingOn) }, OR: [{ accountId: id }, { toAccountId: id }] }, select: { number: true } });
      if (earlier) throw new BadRequestException(`Voucher ${earlier.number} is dated before that opening date. Cancel it first or pick an earlier date.`);
    }
    await this.prisma.financeAccount.update({
      where: { id },
      data: { name: data.name, openingBalancePkr: data.openingBalancePkr, openingOn: data.openingOn ? dateOnly(data.openingOn) : undefined, active: data.active },
    });
    await audit(this.prisma, { schoolId, actorId, action: "finance_account_updated", entity: "finance_account", entityId: id, summary: Object.keys(data).join(", ") });
    return (await this.accounts(schoolId)).find((a) => a.id === id)!;
  }

  async categories(schoolId: string): Promise<FinanceCategoryView[]> {
    await this.ensureDefaults(schoolId);
    const [rows, used] = await Promise.all([
      this.prisma.financeCategory.findMany({ where: { schoolId }, orderBy: [{ kind: "desc" }, { systemKey: "asc" }, { name: "asc" }] }),
      this.prisma.voucher.groupBy({ by: ["categoryId"], where: { schoolId, categoryId: { not: null } } }),
    ]);
    const usedIds = new Set(used.map((u) => u.categoryId));
    // System categories first, then the rest alphabetically within income and expense.
    return rows
      .map((r) => ({ id: r.id, name: r.name, kind: r.kind, system: r.systemKey !== null, active: r.active, used: usedIds.has(r.id) }))
      .sort((a, b) => (a.kind === b.kind ? Number(b.system) - Number(a.system) || a.name.localeCompare(b.name) : a.kind === "INCOME" ? -1 : 1));
  }

  async createCategory(schoolId: string, actorId: string, body: unknown) {
    const data = categorySchema.parse(body);
    if (await this.prisma.financeCategory.findUnique({ where: { schoolId_kind_name: { schoolId, kind: data.kind, name: data.name } }, select: { id: true } })) throw new ConflictException("You already have a category with that name");
    const row = await this.prisma.financeCategory.create({ data: { schoolId, name: data.name, kind: data.kind } });
    await audit(this.prisma, { schoolId, actorId, action: "finance_category_created", entity: "finance_category", entityId: row.id, summary: row.name });
    return (await this.categories(schoolId)).find((c) => c.id === row.id)!;
  }

  async updateCategory(schoolId: string, actorId: string, id: string, body: unknown) {
    const data = categoryUpdateSchema.parse(body);
    const current = await this.prisma.financeCategory.findFirst({ where: { id, schoolId } });
    if (!current) throw new NotFoundException("Category not found");
    if (current.systemKey && (data.name !== undefined || data.active === false)) throw new BadRequestException("This category is filled in by fees and payroll, so it can't be renamed or switched off");
    if (data.name && data.name !== current.name && (await this.prisma.financeCategory.findUnique({ where: { schoolId_kind_name: { schoolId, kind: current.kind, name: data.name } }, select: { id: true } }))) {
      throw new ConflictException("You already have a category with that name");
    }
    await this.prisma.financeCategory.update({ where: { id }, data: { name: data.name, active: data.active } });
    await audit(this.prisma, { schoolId, actorId, action: "finance_category_updated", entity: "finance_category", entityId: id, summary: Object.keys(data).join(", ") });
    return (await this.categories(schoolId)).find((c) => c.id === id)!;
  }

  // Vouchers ------------------------------------------------------------------------------------------------

  private async names(ids: (string | null)[]) {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (!wanted.length) return new Map<string, string>();
    return new Map((await this.prisma.user.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  }

  private view(row: VoucherRow, people: Map<string, string>): VoucherView {
    return {
      id: row.id,
      number: row.number,
      type: row.type,
      date: isoOf(row.date),
      amountPkr: row.amountPkr,
      accountId: row.accountId,
      accountName: row.account.name,
      toAccountId: row.toAccountId,
      toAccountName: row.toAccount?.name ?? null,
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? null,
      party: row.party,
      method: row.method,
      reference: row.reference,
      note: row.note,
      source: row.source,
      status: row.status,
      voidReason: row.voidReason,
      voidedAt: row.voidedAt?.toISOString() ?? null,
      voidedBy: row.voidedById ? (people.get(row.voidedById) ?? null) : null,
      createdBy: row.createdById ? (people.get(row.createdById) ?? null) : null,
      createdAt: row.createdAt.toISOString(),
      canVoid: row.status === "POSTED" && row.source === "MANUAL",
    };
  }

  async vouchers(schoolId: string, query: VoucherListQuery): Promise<VoucherList> {
    const { page, pageSize, skip, take } = pageParams(query, 25);
    const today = karachiToday();
    const { from, to } = dateRange(query, today, `${today.slice(0, 4)}-01-01`);
    const q = query.q?.trim();
    const where: Prisma.VoucherWhereInput = {
      schoolId,
      date: { gte: dateOnly(from), lte: dateOnly(to) },
      ...(["PAYMENT", "RECEIPT", "TRANSFER"].includes(query.type ?? "") ? { type: query.type as "PAYMENT" } : {}),
      ...(query.accountId ? { OR: [{ accountId: query.accountId }, { toAccountId: query.accountId }] } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status === "VOIDED" ? { status: "VOIDED" } : query.status === "ALL" ? {} : { status: "POSTED" }),
      ...(q ? { AND: [{ OR: [{ number: { contains: q, mode: "insensitive" } }, { party: { contains: q, mode: "insensitive" } }, { note: { contains: q, mode: "insensitive" } }, { reference: { contains: q, mode: "insensitive" } }] }] } : {}),
    };
    const [rows, total, sums] = await Promise.all([
      this.prisma.voucher.findMany({ where, include: voucherInclude, orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "asc" }], skip, take }),
      this.prisma.voucher.count({ where }),
      this.prisma.voucher.groupBy({ by: ["type"], where: { ...where, status: "POSTED" }, _sum: { amountPkr: true } }),
    ]);
    const people = await this.names(rows.flatMap((r) => [r.createdById, r.voidedById]));
    const sum = (type: string) => sums.find((s) => s.type === type)?._sum.amountPkr ?? 0;
    return { items: rows.map((r) => this.view(r, people)), total, page, pageSize, totalInPkr: sum("RECEIPT"), totalOutPkr: sum("PAYMENT") };
  }

  async voucher(schoolId: string, id: string): Promise<VoucherView> {
    const row = await this.prisma.voucher.findFirst({ where: { id, schoolId }, include: voucherInclude });
    if (!row) throw new NotFoundException("Voucher not found");
    return this.view(row, await this.names([row.createdById, row.voidedById]));
  }

  /** Writes a voucher inside a transaction the caller owns, so inventory can buy stock and record the spend as one step. */
  async createVoucherTx(tx: Tx, schoolId: string, actorId: string, input: VoucherCreateInput, origin: { source: "MANUAL" | "INVENTORY"; sourceId?: string } = { source: "MANUAL" }) {
    const data = voucherCreateSchema.parse(input);
    const today = karachiToday();
    if (data.date > today) throw new BadRequestException("A voucher can't be dated in the future");
    const account = await tx.financeAccount.findFirst({ where: { id: data.accountId, schoolId } });
    if (!account) throw new BadRequestException("Choose an account");
    if (!account.active) throw new BadRequestException(`${account.name} is switched off`);
    if (data.date < isoOf(account.openingOn)) throw new BadRequestException(`${account.name} only starts on ${isoOf(account.openingOn)}. Pick a later date, or change its opening date in Accounts settings.`);
    let toAccount = null;
    if (data.type === "TRANSFER") {
      toAccount = await tx.financeAccount.findFirst({ where: { id: data.toAccountId!, schoolId } });
      if (!toAccount) throw new BadRequestException("Choose the account the money goes to");
      if (!toAccount.active) throw new BadRequestException(`${toAccount.name} is switched off`);
      if (data.date < isoOf(toAccount.openingOn)) throw new BadRequestException(`${toAccount.name} only starts on ${isoOf(toAccount.openingOn)}. Pick a later date.`);
    }
    let categoryId: string | null = null;
    if (data.type !== "TRANSFER") {
      const category = await tx.financeCategory.findFirst({ where: { id: data.categoryId!, schoolId } });
      if (!category) throw new BadRequestException("Choose a category");
      if (!category.active) throw new BadRequestException(`${category.name} is switched off`);
      if (category.systemKey) throw new BadRequestException("Fee collection and salaries come from fees and payroll automatically, so they can't be used on a voucher");
      if (category.kind !== (data.type === "PAYMENT" ? "EXPENSE" : "INCOME")) throw new BadRequestException(data.type === "PAYMENT" ? "Pick an expense category for a payment" : "Pick an income category for a receipt");
      categoryId = category.id;
    }
    const number = await nextSchoolNumber(tx, schoolId, "VCH", Number(data.date.slice(0, 4)));
    return tx.voucher.create({
      data: {
        schoolId,
        number,
        type: data.type,
        date: dateOnly(data.date),
        amountPkr: data.amountPkr,
        accountId: account.id,
        toAccountId: toAccount?.id ?? null,
        categoryId,
        party: data.party,
        method: data.method,
        reference: data.reference,
        note: data.note,
        source: origin.source,
        sourceId: origin.sourceId ?? null,
        createdById: actorId,
      },
      include: voucherInclude,
    });
  }

  async createVoucher(schoolId: string, actorId: string, body: unknown): Promise<VoucherView> {
    const row = await this.prisma.$transaction((tx) => this.createVoucherTx(tx, schoolId, actorId, body as VoucherCreateInput));
    await audit(this.prisma, { schoolId, actorId, action: "voucher_created", entity: "voucher", entityId: row.id, summary: `${row.number} Rs. ${row.amountPkr}` });
    return this.view(row, await this.names([actorId]));
  }

  /** Cancels a voucher. It stays in the book, marked cancelled with who did it and why. */
  async voidVoucherTx(tx: Tx, schoolId: string, actorId: string, id: string, reason: string, allowInventory = false) {
    const row = await tx.voucher.findFirst({ where: { id, schoolId } });
    if (!row) throw new NotFoundException("Voucher not found");
    if (row.status === "VOIDED") throw new BadRequestException("This voucher is already cancelled");
    if (row.source === "INVENTORY" && !allowInventory) throw new BadRequestException("This voucher came from buying stock. Cancel the purchase in Inventory instead.");
    return tx.voucher.update({ where: { id }, data: { status: "VOIDED", voidedAt: new Date(), voidedById: actorId, voidReason: reason }, include: voucherInclude });
  }

  async voidVoucher(schoolId: string, actorId: string, id: string, body: unknown): Promise<VoucherView> {
    const { reason } = voucherVoidSchema.parse(body);
    const row = await this.prisma.$transaction((tx) => this.voidVoucherTx(tx, schoolId, actorId, id, reason));
    await audit(this.prisma, { schoolId, actorId, action: "voucher_voided", entity: "voucher", entityId: id, summary: `${row.number}: ${reason}` });
    return this.view(row, await this.names([row.createdById, actorId]));
  }

  /** Default category for stock purchases, by name, falling back to any active expense category. */
  async expenseCategoryFor(schoolId: string, preferred: string, db: Db = this.prisma) {
    const named = await db.financeCategory.findFirst({ where: { schoolId, kind: "EXPENSE", name: preferred, active: true, systemKey: null }, select: { id: true } });
    if (named) return named.id;
    const any = await db.financeCategory.findFirst({ where: { schoolId, kind: "EXPENSE", active: true, systemKey: null }, orderBy: { name: "asc" }, select: { id: true } });
    return any?.id ?? null;
  }

  // Used by reports and ratios ------------------------------------------------------------------------------

  async flow(schoolId: string, from: string, to: string) {
    return flowSummary(await this.entries(schoolId, from, to), from, to);
  }

  async monthlyFlow(schoolId: string, from: string, to: string) {
    const months = monthsBetween(from, to);
    const entries = await this.entries(schoolId, from, to);
    return { months, rows: monthlyFlow(entries, months), entries };
  }

}
