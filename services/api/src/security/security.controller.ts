import { Controller, Get, Header } from "@nestjs/common";
import { Public } from "../auth/auth.guard.js";
import { AltchaService } from "./altcha.service.js";

@Controller("public/v1")
export class SecurityController {
  constructor(private readonly altcha: AltchaService) {}

  /** Reto ALTCHA para formularios públicos. */
  @Public()
  @Get("altcha")
  @Header("Cache-Control", "no-store")
  challenge() {
    return this.altcha.challenge();
  }
}
