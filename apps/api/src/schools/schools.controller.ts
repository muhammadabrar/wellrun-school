import { Body, Controller, Get, Inject, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin } from "../common/roles";
import { taxonomy } from "../common/taxonomy";
import { SchoolsService } from "./schools.service";

@Controller("schools")
export class SchoolsController {
  constructor(@Inject(SchoolsService) private readonly schools: SchoolsService) {}

  @Get()
  list(
    @Query("city") city?: string,
    @Query("q") q?: string,
    @Query("type") type?: string,
    @Query("fee") fee?: string,
    @Query("facility") facility?: string,
    @Query("area") area?: string,
  ) {
    return this.schools.list({ city, q, type, fee, facility, area });
  }

  @Get("meta/cities")
  cities() {
    return this.schools.cities();
  }

  @Get("meta/taxonomy")
  taxonomy() {
    return taxonomy();
  }

  @Get("compare")
  compare(@Query("slugs") slugs?: string) {
    const list = (slugs ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    return this.schools.compare(list);
  }

  @Get(":slug")
  bySlug(@Param("slug") slug: string) {
    return this.schools.bySlug(slug);
  }

  @Patch("me/profile")
  @UseGuards(AuthGuard)
  update(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.schools.updateProfile(requireSchoolAdmin(req.user), req.user.id, body);
  }
}
