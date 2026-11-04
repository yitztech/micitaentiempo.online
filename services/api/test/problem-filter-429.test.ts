import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ProblemFilter } from "../src/common/problem.filter.js";

function run(exception: unknown) {
  const header = vi.fn().mockReturnThis();
  const send = vi.fn();
  const status = vi.fn().mockReturnThis();
  const reply = { header, status, send };
  const host = {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => ({ headers: {}, url: "/x", id: "1", raw: {} }),
    }),
  };
  new ProblemFilter().catch(exception, host as never);
  return { header, status, send };
}

describe("ProblemFilter con 429", () => {
  it("emite Retry-After y el código estable, sin exponer la cabecera en el cuerpo", () => {
    const { header, status, send } = run(
      new HttpException({ code: "rate_limited", message: "x", headers: { "Retry-After": "42" } }, 429),
    );
    expect(status).toHaveBeenCalledWith(429);
    expect(header).toHaveBeenCalledWith("Retry-After", "42");
    expect(send.mock.calls[0]?.[0]).toMatchObject({ status: 429, code: "rate_limited" });
    expect(JSON.stringify(send.mock.calls[0]?.[0])).not.toContain("Retry-After");
  });

  it("no añade Retry-After a otros errores", () => {
    const { header } = run(new HttpException({ code: "bad_request", headers: { "Retry-After": "1" } }, 400));
    expect(header).not.toHaveBeenCalledWith("Retry-After", expect.anything());
  });
});
