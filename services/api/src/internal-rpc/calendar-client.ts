import { randomUUID } from "node:crypto";
import type { DescService } from "@bufbuild/protobuf";
import {
  type CallOptions,
  type Client,
  createClient,
  createContextKey,
  createContextValues,
  type Interceptor,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { type ActorClaims, AUDIENCE_CALENDAR, ISSUER_API, signInternal } from "./jwt.js";

/** Contexto de cada llamada al motor: quién actúa y el id de petición. */
export interface CallActor {
  actor: ActorClaims;
  requestId?: string;
}

const ACTOR_KEY = createContextKey<CallActor | undefined>(undefined, { description: "actor del motor" });

/** Opciones de llamada para actuar en nombre de un actor. */
export function asActor(call: CallActor): CallOptions {
  return { contextValues: createContextValues().set(ACTOR_KEY, call) };
}

/**
 * Crea clientes Connect hacia calendar. Cada llamada lleva un JWT interno de 60 s con el actor
 * (`contextValues`) y propaga X-Request-Id.
 */
export function calendarClients(baseUrl: string, secret: string) {
  const auth: Interceptor = (next) => async (req) => {
    const call = req.contextValues.get(ACTOR_KEY);
    const actor = call?.actor ?? { role: "system", via: "system" };
    const requestId = call?.requestId ?? randomUUID();
    req.header.set(
      "Authorization",
      `Bearer ${await signInternal(secret, actor, { issuer: ISSUER_API, audience: AUDIENCE_CALENDAR, requestId })}`,
    );
    req.header.set("X-Request-Id", requestId);
    return next(req);
  };
  const transport = createConnectTransport({
    baseUrl,
    httpVersion: "1.1",
    interceptors: [auth],
    defaultTimeoutMs: 10_000,
  });
  return {
    client<T extends DescService>(service: T): Client<T> {
      return createClient(service, transport);
    },
  };
}

export type CalendarClients = ReturnType<typeof calendarClients>;
