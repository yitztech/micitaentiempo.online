import { EventEmitter } from "node:events";
import type { DomainEvent } from "@mcet/contracts/mcet/api/v1/event_ingress_pb";
import { Injectable } from "@nestjs/common";

/** Cambio de un tablero que el panel debe reflejar (sin datos personales). */
export interface RealtimeChange {
  type: string;
  calendarId: string;
  eventId?: string;
  actorUserId?: string;
  /** Solo para este usuario (avisos del panel). */
  userId?: string;
}

/** Bus en memoria (un solo proceso de `api`) entre la ingesta de eventos y los flujos SSE. */
@Injectable()
export class RealtimeBus {
  private readonly emitter = new EventEmitter().setMaxListeners(0);

  publish(change: RealtimeChange): void {
    this.emitter.emit("change", change);
  }

  private readonly handlers: Array<(event: DomainEvent) => Promise<void>> = [];

  /** Registra un manejador de eventos de dominio (avisos); se espera a todos al recibir un evento. */
  handle(fn: (event: DomainEvent) => Promise<void>): void {
    this.handlers.push(fn);
  }

  async dispatch(event: DomainEvent): Promise<void> {
    for (const fn of this.handlers) await fn(event);
  }

  subscribe(fn: (change: RealtimeChange) => void): () => void {
    this.emitter.on("change", fn);
    return () => this.emitter.off("change", fn);
  }
}
