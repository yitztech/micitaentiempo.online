import type { Lang } from "@mcet/i18n";

/** Error de un canal: `permanent` desactiva el canal (bot bloqueado, webhook borrado…). */
export class ChannelError extends Error {
  constructor(
    message: string,
    readonly permanent = false,
  ) {
    super(message);
  }
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new ChannelError(`red: ${(err as Error).message}`);
  }
  return res;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Telegram Bot API: sendMessage con HTML escapado. 403 = el usuario bloqueó el bot. */
export async function sendTelegram(
  base: string,
  token: string,
  chatId: string,
  text: string,
  link?: { url: string; label: string },
) {
  const html =
    escapeHtml(text) + (link ? `\n\n<a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>` : "");
  const res = await post(`${base}/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  if (res.status === 403 || res.status === 400) throw new ChannelError(`telegram ${res.status}`, true);
  if (!res.ok) throw new ChannelError(`telegram ${res.status}`);
}

/** Slack: webhook entrante con Block Kit. 404/410 = webhook revocado. */
export async function sendSlack(webhookUrl: string, text: string, link?: { url: string; label: string }) {
  const blocks: unknown[] = [{ type: "section", text: { type: "mrkdwn", text } }];
  if (link) {
    blocks.push({
      type: "actions",
      elements: [{ type: "button", text: { type: "plain_text", text: link.label }, url: link.url }],
    });
  }
  const res = await post(webhookUrl, { text, blocks });
  if (res.status === 404 || res.status === 410 || res.status === 403)
    throw new ChannelError(`slack ${res.status}`, true);
  if (!res.ok) throw new ChannelError(`slack ${res.status}`);
}

/**
 * WhatsApp Business Cloud API: plantilla de utilidad aprobada (`mcet_aviso`, un parámetro de texto).
 * Implementado y desactivado hasta que existan las variables WHATSAPP_* (decisión del 2026-10-06).
 */
export async function sendWhatsApp(
  base: string,
  token: string,
  phoneNumberId: string,
  to: string,
  lang: Lang,
  template: "mcet_aviso" | "mcet_codigo",
  text: string,
) {
  const res = await post(
    `${base}/${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      to: to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: template,
        language: { code: lang === "es" ? "es_MX" : "en_US" },
        components: [{ type: "body", parameters: [{ type: "text", text }] }],
      },
    },
    { authorization: `Bearer ${token}` },
  );
  if (res.status === 400 || res.status === 403)
    throw new ChannelError(`whatsapp ${res.status}`, res.status === 403);
  if (!res.ok) throw new ChannelError(`whatsapp ${res.status}`);
}
