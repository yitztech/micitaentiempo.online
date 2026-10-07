import { Code, ConnectError } from "@connectrpc/connect";
import { HttpException, HttpStatus } from "@nestjs/common";

const STATUS: Partial<Record<Code, HttpStatus>> = {
  [Code.InvalidArgument]: HttpStatus.BAD_REQUEST,
  [Code.NotFound]: HttpStatus.NOT_FOUND,
  [Code.PermissionDenied]: HttpStatus.FORBIDDEN,
  [Code.AlreadyExists]: HttpStatus.CONFLICT,
  [Code.FailedPrecondition]: HttpStatus.CONFLICT,
  [Code.Aborted]: HttpStatus.CONFLICT,
  [Code.ResourceExhausted]: HttpStatus.TOO_MANY_REQUESTS,
  [Code.Unavailable]: HttpStatus.SERVICE_UNAVAILABLE,
  [Code.DeadlineExceeded]: HttpStatus.GATEWAY_TIMEOUT,
};

/** Traduce un error del motor («motivo: detalle») a problem+json con código estable. */
export function fromRpc(err: unknown): never {
  if (err instanceof ConnectError) {
    const [reason, ...rest] = err.rawMessage.split(": ");
    const status = STATUS[err.code] ?? HttpStatus.BAD_GATEWAY;
    throw new HttpException(
      {
        code: status === HttpStatus.BAD_GATEWAY ? "engine_error" : reason,
        message: rest.join(": ") || err.rawMessage,
      },
      status,
    );
  }
  throw err;
}

/** Ejecuta una llamada al motor traduciendo sus errores. */
export async function rpc<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (err) {
    return fromRpc(err);
  }
}
