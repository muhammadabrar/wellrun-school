import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { audit } from "../common/audit";
import { PrismaService } from "../prisma/prisma.service";
import { SessionService } from "../session/session.service";

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(SessionService) private readonly session: SessionService,
  ) {}

  private async tokenFor(user: { id: string; email: string; name: string; role: string; schoolId: string | null }) {
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      schoolId: user.schoolId,
    };
    return {
      token: await this.jwt.signAsync(payload),
      user: payload,
      schoolContext: await this.session.forSchool(user.schoolId),
    };
  }

  async signup(name: string, email: string, password: string) {
    const normalized = email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (exists) throw new BadRequestException("An account with this email already exists");
    const user = await this.prisma.user.create({
      data: {
        name: name.trim(),
        email: normalized,
        password: await bcrypt.hash(password, 10),
        role: "PARENT",
      },
    });
    return this.tokenFor(user);
  }

  async registerSchool(name: string, email: string, password: string, schoolName: string) {
    const normalized = email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (exists) throw new BadRequestException("An account with this email already exists");
    const slugBase = schoolName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    let slug = slugBase || "school";
    let n = 1;
    while (await this.prisma.school.findUnique({ where: { slug } })) {
      slug = `${slugBase}-${n}`;
      n += 1;
    }
    const school = await this.prisma.school.create({
      data: {
        name: schoolName.trim(),
        slug,
        city: "",
        country: "Pakistan",
        published: false,
        l2Active: true,
        claimStatus: "APPROVED",
        setupCompleted: false,
        setupStep: 1,
      },
    });
    const user = await this.prisma.user.create({
      data: {
        name: name.trim(),
        email: normalized,
        password: await bcrypt.hash(password, 10),
        role: "SCHOOL_ADMIN",
        schoolId: school.id,
      },
    });
    await this.prisma.schoolProfile.create({
      data: {
        schoolId: school.id,
        about: "",
        location: "",
        principal: name.trim(),
        establishedYear: new Date().getFullYear(),
        studentCount: 0,
        teacherCount: 0,
        facilities: [],
        labs: [],
        sports: [],
        activities: [],
        programs: [],
        feeMinPkr: 0,
        feeMaxPkr: 0,
        feeNotes: "",
      },
    });
    await audit(this.prisma, {
      schoolId: school.id,
      actorId: user.id,
      action: "school_registered",
      entity: "school",
      entityId: school.id,
    });
    return this.tokenFor(user);
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user || user.disabled || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException("Email or password is incorrect");
    }
    return this.tokenFor(user);
  }

  async forgot(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (user && !user.disabled) {
      const token = randomBytes(24).toString("hex");
      await this.prisma.passwordReset.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      console.log(`Password reset for ${user.email}:`);
      console.log(`  Console  http://localhost:5173/reset-password?token=${token}`);
      console.log(`  Discover http://localhost:3001/reset-password?token=${token}`);
    }
    return { message: "If an account exists for that email, we sent a reset link." };
  }

  async reset(token: string, password: string) {
    const row = await this.prisma.passwordReset.findUnique({ where: { token } });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new BadRequestException("This reset link is no longer valid.");
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: { password: await bcrypt.hash(password, 10) },
      }),
      this.prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ]);
    return { message: "Password updated. Sign in with the new password." };
  }

  async acceptInvite(token: string, password?: string, name?: string) {
    const invite = await this.prisma.invite.findUnique({ where: { token } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new BadRequestException("This invite has expired. Ask your admin to send a new one.");
    }
    let user = await this.prisma.user.findUnique({ where: { email: invite.email } });
    if (!user) {
      if (!password || password.length < 8) throw new BadRequestException("Password must be at least 8 characters");
      user = await this.prisma.user.create({
        data: {
          email: invite.email,
          name: name?.trim() || invite.email.split("@")[0],
          password: await bcrypt.hash(password, 10),
          role: invite.role,
          schoolId: invite.schoolId,
        },
      });
    } else if (user.role === "PLATFORM_ADMIN") {
      throw new BadRequestException("This email cannot be invited.");
    } else if (user.schoolId && user.schoolId !== invite.schoolId && user.role !== "PARENT") {
      throw new BadRequestException("This email already belongs to another school.");
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { role: invite.role, schoolId: invite.schoolId },
      });
    }
    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), acceptedById: user.id },
    });
    await audit(this.prisma, {
      schoolId: invite.schoolId,
      actorId: user.id,
      action: "invite_accepted",
      entity: "invite",
      entityId: invite.id,
    });
    return this.tokenFor(user);
  }
}
