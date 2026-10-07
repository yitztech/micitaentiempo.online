import { Injectable } from "@nestjs/common";

/** Reloj de `api`. En TEST_MODE se puede fijar (recordatorios y caducidades en los escenarios). */
@Injectable()
export class AppClock {
  private fixed: Date | null = null;
  private setAt = 0;

  now(): Date {
    if (!this.fixed) return new Date();
    // El reloj fijado avanza con el tiempo real desde que se fijó.
    return new Date(this.fixed.getTime() + (Date.now() - this.setAt));
  }

  set(at: Date | null): void {
    this.fixed = at;
    this.setAt = Date.now();
  }
}
