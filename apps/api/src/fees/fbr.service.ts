import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { decryptSecret } from "../common/crypto";

@Injectable()
export class FbrInvoiceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async submitInvoice(schoolId: string, invoiceId: string) {
    const row = await this.requireRow(schoolId, invoiceId);
    if (!(await this.enabled(schoolId))) return row;
    throw new BadRequestException("FBR e-invoicing is not configured");
  }

  async getInvoiceStatus(schoolId: string, invoiceId: string) {
    return this.requireRow(schoolId, invoiceId);
  }

  async cancelInvoice(schoolId: string, invoiceId: string) {
    const row = await this.requireRow(schoolId, invoiceId);
    if (!(await this.enabled(schoolId))) return row;
    throw new BadRequestException("FBR e-invoicing is not configured");
  }

  async generateQrData(schoolId: string, invoiceId: string) {
    await this.requireRow(schoolId, invoiceId);
    if (!(await this.enabled(schoolId))) return null;
    throw new BadRequestException("FBR e-invoicing is not configured");
  }

  credentials(schoolId: string) {
    return this.prisma.schoolFeeSettings.findUnique({ where: { schoolId } }).then((row) => {
      if (!row?.fbrCredentialsEnc) return "";
      return decryptSecret(row.fbrCredentialsEnc);
    });
  }

  private async enabled(schoolId: string) {
    const settings = await this.prisma.schoolFeeSettings.findUnique({ where: { schoolId } });
    return Boolean(settings?.fbrEnabled);
  }

  private async requireRow(schoolId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, schoolId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return this.prisma.fbrInvoice.upsert({
      where: { invoiceId },
      create: { schoolId, invoiceId, fbrStatus: "NOT_REQUIRED" },
      update: {},
    });
  }
}
