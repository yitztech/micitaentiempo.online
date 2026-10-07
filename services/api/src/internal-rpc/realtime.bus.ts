import { EventEmitter } from "node:events";
import { Injectable } from "@nestjs/common";

/** Cambio de un tablero que el panel debe reflejar (sin datos personales). */
export interface RealtimeChange {
  type: string;
  calendarId: string;
  eventId?: string;
  actorUserId?: string;
}

/** Bus en memoria (un solo proceso de `api`) entre la ingesta de eventos y los flujos SSE. */
@Injectable()
export class RealtimeBus {
  private readonly emitter = new EventEmitter().setMaxListeners(0);

  publish(change: RealtimeChange): void {
    this.emitter.emit("change", change);
  }

  subscribe(fn: (change: RealtimeChange) => void): () => void {
    this.emitter.on("change", fn);
    return () => this.emitter.off("change", fn);
  }
}
