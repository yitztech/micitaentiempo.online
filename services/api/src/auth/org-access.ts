import { ForbiddenException } from "@nestjs/common";

export function canWriteOrganization(status: string): boolean {
  return status === "trialing" || status === "active" || status === "past_due";
}

export function requireOrganizationWrite(status: string | undefined): void {
  if (!status || !canWriteOrganization(status)) {
    throw new ForbiddenException({ code: "org_read_only", message: "Organización en solo lectura" });
  }
}
