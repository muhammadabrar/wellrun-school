import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ITEM_KINDS,
  ITEM_STATUSES,
  isLowStock,
  isoOf,
  itemSchema,
  itemUpdateSchema,
  movementDelta,
  movementSchema,
  movementVoidSchema,
  pageParams,
  stockValuePkr,
  type InventoryDetail,
  type InventoryItemView,
  type InventoryList,
  type InventorySummary,
  type MovementView,
} from "@wellrun/shared";
import { audit } from "../common/audit";
import { dateOnly, karachiToday } from "../common/date";
import { FinanceService } from "../finance/finance.service";
import { PrismaService } from "../prisma/prisma.service";

export type InventoryListQuery = { q?: string; kind?: string; status?: string; low?: string; inactive?: string; page?: string; pageSize?: string };

type ItemRow = Prisma.InventoryItemGetPayload<object>;

const itemView = (row: ItemRow): InventoryItemView => ({
  id: row.id,
  name: row.name,
  code: row.code,
  kind: row.kind,
  category: row.category,
  unit: row.unit,
  location: row.location,
  reorderLevel: row.reorderLevel,
  onHand: row.onHand,
  unitCostPkr: row.unitCostPkr,
  valuePkr: stockValuePkr(row),
  status: row.status,
  serialNo: row.serialNo,
  notes: row.notes,
  active: row.active,
  low: isLowStock(row),
});

/** The default category for each kind of stock, matched by name so a school that renamed it still gets a sensible one. */
const PURCHASE_CATEGORY = { ASSET: "Furniture and equipment", CONSUMABLE: "Supplies and stationery" } as const;

@Injectable()
export class InventoryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FinanceService) private readonly finance: FinanceService,
  ) {}

  private where(schoolId: string, query: InventoryListQuery): Prisma.InventoryItemWhereInput {
    const q = query.q?.trim();
    const kind = ITEM_KINDS.find((k) => k === query.kind);
    const status = ITEM_STATUSES.find((s) => s === query.status);
    return {
      schoolId,
      ...(query.inactive === "1" ? {} : { active: true }),
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { category: { contains: q, mode: "insensitive" } }, { location: { contains: q, mode: "insensitive" } }] } : {}),
    };
  }

  async list(schoolId: string, query: InventoryListQuery): Promise<InventoryList> {
    const { page, pageSize, skip, take } = pageParams(query, 25);
    const where = this.where(schoolId, query);
    if (query.low === "1") {
      // "Running low" compares two columns, which the query builder can't, so find the ids first.
      const rows = await this.prisma.inventoryItem.findMany({ where: { ...where, kind: "CONSUMABLE", reorderLevel: { not: null } }, select: { id: true, onHand: true, reorderLevel: true } });
      const ids = rows.filter((r) => r.reorderLevel !== null && r.onHand <= r.reorderLevel).map((r) => r.id);
      const [items, total] = [await this.prisma.inventoryItem.findMany({ where: { id: { in: ids } }, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take }), ids.length];
      return { items: items.map(itemView), total, page, pageSize };
    }
    const [items, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take }),
      this.prisma.inventoryItem.count({ where }),
    ]);
    return { items: items.map(itemView), total, page, pageSize };
  }

  async summary(schoolId: string): Promise<InventorySummary> {
    const month = karachiToday().slice(0, 7);
    const [items, bought] = await Promise.all([
      this.prisma.inventoryItem.findMany({ where: { schoolId, active: true }, select: { kind: true, onHand: true, unitCostPkr: true, reorderLevel: true, status: true, active: true } }),
      this.prisma.inventoryMovement.aggregate({ where: { schoolId, type: "PURCHASE", voidedAt: null, date: { gte: dateOnly(`${month}-01`) } }, _sum: { totalCostPkr: true } }),
    ]);
    return {
      items: items.length,
      assets: items.filter((i) => i.kind === "ASSET").length,
      consumables: items.filter((i) => i.kind === "CONSUMABLE").length,
      lowStock: items.filter(isLowStock).length,
      valuePkr: items.reduce((sum, i) => sum + stockValuePkr(i), 0),
      boughtThisMonthPkr: bought._sum.totalCostPkr ?? 0,
    };
  }

  async detail(schoolId: string, id: string): Promise<InventoryDetail> {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, schoolId } });
    if (!item) throw new NotFoundException("Item not found");
    const movements = await this.prisma.inventoryMovement.findMany({ where: { itemId: id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "asc" }], take: 200 });
    const [people, vouchers] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: [...new Set(movements.flatMap((m) => (m.createdById ? [m.createdById] : [])))] } }, select: { id: true, name: true } }),
      this.prisma.voucher.findMany({ where: { id: { in: movements.flatMap((m) => (m.voucherId ? [m.voucherId] : [])) } }, select: { id: true, number: true } }),
    ]);
    const who = new Map(people.map((p) => [p.id, p.name]));
    const number = new Map(vouchers.map((v) => [v.id, v.number]));
    const views: MovementView[] = movements.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: Math.abs(m.quantity),
      delta: m.quantity,
      unitCostPkr: m.unitCostPkr,
      totalCostPkr: m.totalCostPkr,
      date: isoOf(m.date),
      supplier: m.supplier,
      issuedTo: m.issuedTo,
      note: m.note,
      voucherNumber: m.voucherId ? (number.get(m.voucherId) ?? null) : null,
      voided: m.voidedAt !== null,
      by: m.createdById ? (who.get(m.createdById) ?? null) : null,
      canVoid: m.type === "PURCHASE" && m.voidedAt === null,
    }));
    return { item: itemView(item), movements: views };
  }

  async createItem(schoolId: string, actorId: string, body: unknown): Promise<InventoryItemView> {
    const data = itemSchema.parse(body);
    if (await this.prisma.inventoryItem.findFirst({ where: { schoolId, name: { equals: data.name, mode: "insensitive" }, location: data.location, active: true }, select: { id: true } })) {
      throw new ConflictException("You already have an item with that name in that place. Open it and record the stock there.");
    }
    const row = await this.prisma.inventoryItem.create({ data: { schoolId, ...data, reorderLevel: data.kind === "CONSUMABLE" ? (data.reorderLevel ?? null) : null } });
    await audit(this.prisma, { schoolId, actorId, action: "inventory_item_created", entity: "inventory_item", entityId: row.id, summary: row.name });
    return itemView(row);
  }

  async updateItem(schoolId: string, actorId: string, id: string, body: unknown): Promise<InventoryItemView> {
    const data = itemUpdateSchema.parse(body);
    const current = await this.prisma.inventoryItem.findFirst({ where: { id, schoolId } });
    if (!current) throw new NotFoundException("Item not found");
    if (data.kind && data.kind !== current.kind) throw new BadRequestException("An item can't change from an asset to a consumable. Add it again as the other kind.");
    const { kind: _kind, ...rest } = data;
    const row = await this.prisma.inventoryItem.update({ where: { id }, data: { ...rest, reorderLevel: current.kind === "CONSUMABLE" ? rest.reorderLevel : null } });
    await audit(this.prisma, { schoolId, actorId, action: "inventory_item_updated", entity: "inventory_item", entityId: id, summary: Object.keys(data).join(", ") });
    return itemView(row);
  }

  /**
   * Records stock coming in or going out. A purchase with a cost also writes a payment voucher, in the same step,
   * so the money spent shows up in the books and can't be forgotten.
   */
  async addMovement(schoolId: string, actorId: string, itemId: string, body: unknown): Promise<InventoryDetail> {
    const data = movementSchema.parse(body);
    const today = karachiToday();
    if (data.date > today) throw new BadRequestException("A date in the future isn't allowed");
    // A first purchase may come before anyone opened Accounts, so make sure there is a cash box and categories to use.
    if (data.type === "PURCHASE" && data.recordExpense) await this.finance.ensureDefaults(schoolId);
    const voucherNumber = await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({ where: { id: itemId, schoolId } });
      if (!item) throw new NotFoundException("Item not found");
      if (!item.active) throw new BadRequestException("This item is switched off");
      const change = movementDelta(data.type, data.quantity, item.onHand);
      if ("error" in change) throw new BadRequestException(change.error);
      if (change.delta === 0) throw new BadRequestException("That matches what is already in stock");
      const unitCost = data.type === "PURCHASE" ? (data.unitCostPkr ?? item.unitCostPkr) : null;
      const totalCost = data.type === "PURCHASE" ? data.quantity * (unitCost ?? 0) : 0;
      // Stock moves only if nobody changed it meanwhile; otherwise the number on screen was out of date.
      const moved = await tx.inventoryItem.updateMany({ where: { id: itemId, onHand: item.onHand }, data: { onHand: { increment: change.delta }, ...(data.type === "PURCHASE" && unitCost ? { unitCostPkr: unitCost } : {}) } });
      if (!moved.count) throw new ConflictException("The stock changed while you were working. Please try again.");
      const movement = await tx.inventoryMovement.create({
        data: { schoolId, itemId, type: data.type, quantity: change.delta, unitCostPkr: unitCost, totalCostPkr: totalCost, date: dateOnly(data.date), supplier: data.supplier, issuedTo: data.issuedTo, note: data.note, createdById: actorId },
      });
      if (data.type !== "PURCHASE" || !data.recordExpense || totalCost <= 0) return null;
      const accountId = data.accountId ?? (await this.finance.defaultAccounts(schoolId, tx)).CASH;
      const categoryId = data.categoryId ?? (await this.finance.expenseCategoryFor(schoolId, PURCHASE_CATEGORY[item.kind], tx));
      if (!accountId) throw new BadRequestException("Add a cash or bank account in Accounts first, or untick \"Record the money spent\"");
      if (!categoryId) throw new BadRequestException("Add an expense category in Accounts first, or untick \"Record the money spent\"");
      const voucher = await this.finance.createVoucherTx(
        tx,
        schoolId,
        actorId,
        { type: "PAYMENT", date: data.date, amountPkr: totalCost, accountId, categoryId, party: data.supplier, method: "", reference: "", note: `Bought ${data.quantity} ${item.unit} of ${item.name}` },
        { source: "INVENTORY", sourceId: movement.id },
      );
      await tx.inventoryMovement.update({ where: { id: movement.id }, data: { voucherId: voucher.id } });
      return voucher.number;
    });
    await audit(this.prisma, { schoolId, actorId, action: `inventory_${data.type.toLowerCase()}`, entity: "inventory_item", entityId: itemId, summary: `${data.quantity}${voucherNumber ? ` (${voucherNumber})` : ""}` });
    return this.detail(schoolId, itemId);
  }

  /** Undoes a purchase: the stock goes back down and the voucher is cancelled. Only possible while that much is still on the shelf. */
  async voidMovement(schoolId: string, actorId: string, movementId: string, body: unknown): Promise<InventoryDetail> {
    const { reason } = movementVoidSchema.parse(body);
    const itemId = await this.prisma.$transaction(async (tx) => {
      const movement = await tx.inventoryMovement.findFirst({ where: { id: movementId, schoolId } });
      if (!movement) throw new NotFoundException("Purchase not found");
      if (movement.type !== "PURCHASE") throw new BadRequestException("Only a purchase can be cancelled. Fix other mistakes with a stock count.");
      if (movement.voidedAt) throw new BadRequestException("This purchase is already cancelled");
      const item = await tx.inventoryItem.findFirstOrThrow({ where: { id: movement.itemId, schoolId } });
      if (item.onHand < movement.quantity) throw new BadRequestException(`Some of this has already been given out (only ${item.onHand} left). Record a stock count instead.`);
      const moved = await tx.inventoryItem.updateMany({ where: { id: item.id, onHand: item.onHand }, data: { onHand: { decrement: movement.quantity } } });
      if (!moved.count) throw new ConflictException("The stock changed while you were working. Please try again.");
      await tx.inventoryMovement.update({ where: { id: movementId }, data: { voidedAt: new Date(), voidReason: reason } });
      if (movement.voucherId) await this.finance.voidVoucherTx(tx, schoolId, actorId, movement.voucherId, `Purchase cancelled: ${reason}`, true);
      return item.id;
    });
    await audit(this.prisma, { schoolId, actorId, action: "inventory_purchase_cancelled", entity: "inventory_item", entityId: itemId, summary: reason });
    return this.detail(schoolId, itemId);
  }
}
