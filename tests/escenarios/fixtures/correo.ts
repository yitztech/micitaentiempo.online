import type { APIRequestContext } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

export interface Correo {
  id: string;
  subject: string;
  text: string;
  html: string;
  from: string;
  attachments: Array<{ fileName: string; contentType: string }>;
}

/** Espera el último correo enviado a una dirección (Mailpit). */
export async function esperarCorreo(
  request: APIRequestContext,
  para: string,
  opts: { asunto?: RegExp; timeoutMs?: number } = {},
): Promise<Correo> {
  const limite = Date.now() + (opts.timeoutMs ?? 15_000);
  while (Date.now() < limite) {
    const res = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${para}"`)}`);
    const { messages } = (await res.json()) as { messages: Array<{ ID: string; Subject: string }> };
    const msg = messages.find((m) => !opts.asunto || opts.asunto.test(m.Subject));
    if (msg) {
      const full = (await (await request.get(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as {
        Subject: string;
        Text: string;
        HTML: string;
        From: { Address: string; Name: string };
        Attachments: Array<{ FileName: string; ContentType: string }>;
      };
      return {
        id: msg.ID,
        subject: full.Subject,
        text: full.Text,
        html: full.HTML,
        from: `${full.From.Name} <${full.From.Address}>`,
        attachments: full.Attachments.map((a) => ({ fileName: a.FileName, contentType: a.ContentType })),
      };
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No llegó ningún correo para ${para}`);
}

/** Primer enlace del correo que contenga el texto dado. */
export function enlace(correo: Correo, contiene: string): string {
  const url = correo.text.match(/https?:\/\/\S+/g)?.find((u) => u.includes(contiene));
  if (!url) throw new Error(`El correo no tiene un enlace con ${contiene}`);
  return url.replace(/[)\]>.,]+$/, "");
}
