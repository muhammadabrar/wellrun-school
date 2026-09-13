import { ForbiddenException } from "@nestjs/common";
import type { CurrentUser } from "./current-user";

export function requireSchoolId(user: CurrentUser) {
  if (user.role === "PLATFORM_ADMIN") {
    throw new ForbiddenException("Pick a school from admin");
  }
  if (user.role === "PARENT" || user.role === "PUBLIC") {
    throw new ForbiddenException("This account is for discovery, not the school console");
  }
  if (!user.schoolId) throw new ForbiddenException("No school on this session");
  return user.schoolId;
}

export function requireSchoolAdmin(user: CurrentUser) {
  const schoolId = requireSchoolId(user);
  if (user.role !== "SCHOOL_ADMIN") throw new ForbiddenException("School admin only");
  return schoolId;
}

export function requirePlatform(user: CurrentUser) {
  if (user.role !== "PLATFORM_ADMIN") throw new ForbiddenException("Platform admin only");
}

export function isTeacher(user: CurrentUser) {
  return user.role === "TEACHER";
}

export function isAdmin(user: CurrentUser) {
  return user.role === "SCHOOL_ADMIN" || user.role === "PLATFORM_ADMIN";
}
