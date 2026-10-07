import { emailsEn, emailsEs, en, es, interpolate, type Lang, noticesEn, noticesEs } from "@mcet/i18n";
import { Button, Text } from "@react-email/components";
import { render } from "@react-email/render";
import { Layout, styles } from "./layout.js";

type Catalog = typeof emailsEs;
const CATALOG: Record<Lang, Catalog> = { es: emailsEs, en: emailsEn };
const BRAND: Record<Lang, string> = { es: es.site.name, en: en.site.name };
const NOTICES_EMAIL: Record<Lang, typeof noticesEs> = { es: noticesEs, en: noticesEn };

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

async function finish(subject: string, element: React.ReactElement): Promise<RenderedEmail> {
  return { subject, html: await render(element), text: await render(element, { plainText: true }) };
}

function greeting(t: Catalog, name?: string) {
  return name ? interpolate(t.greeting, { name }) : t.greetingNoName;
}

export async function verifyEmail(lang: Lang, p: { name?: string; url: string; code?: string }) {
  const t = CATALOG[lang];
  return finish(
    t.verify.subject,
    <Layout lang={lang} brand={BRAND[lang]} preview={t.verify.preview} footer={t.footer}>
      <Text style={styles.text}>{greeting(t, p.name)}</Text>
      <Text style={styles.text}>{t.verify.body}</Text>
      <Button href={p.url} style={styles.button}>
        {t.verify.button}
      </Button>
      {p.code ? <Text style={styles.muted}>{interpolate(t.verify.code, { code: p.code })}</Text> : null}
      <Text style={styles.muted}>{t.verify.expires}</Text>
    </Layout>,
  );
}

export async function otpEmail(lang: Lang, p: { code: string }) {
  const t = CATALOG[lang];
  return finish(
    interpolate(t.otp.subject, { code: p.code }),
    <Layout lang={lang} brand={BRAND[lang]} preview={t.otp.preview} footer={t.footer}>
      <Text style={styles.text}>{t.otp.body}</Text>
      <Text style={styles.code}>{p.code}</Text>
      <Text style={styles.muted}>{t.otp.ignore}</Text>
    </Layout>,
  );
}

export async function resetPasswordEmail(lang: Lang, p: { name?: string; url: string }) {
  const t = CATALOG[lang];
  return finish(
    t.reset.subject,
    <Layout lang={lang} brand={BRAND[lang]} preview={t.reset.preview} footer={t.footer}>
      <Text style={styles.text}>{greeting(t, p.name)}</Text>
      <Text style={styles.text}>{t.reset.body}</Text>
      <Button href={p.url} style={styles.button}>
        {t.reset.button}
      </Button>
      <Text style={styles.muted}>{t.reset.expires}</Text>
    </Layout>,
  );
}

export async function invitationEmail(
  lang: Lang,
  p: {
    inviter: string;
    calendar: string;
    role: "editor" | "observer";
    email: string;
    url: string;
    requiresGoogle: boolean;
  },
) {
  const t = CATALOG[lang];
  const vars = { inviter: p.inviter, calendar: p.calendar, role: t.invitation.roles[p.role], email: p.email };
  return finish(
    interpolate(t.invitation.subject, vars),
    <Layout lang={lang} brand={BRAND[lang]} preview={t.invitation.preview} footer={t.footer}>
      <Text style={styles.text}>{interpolate(t.invitation.body, vars)}</Text>
      {p.requiresGoogle ? (
        <Text style={styles.text}>{interpolate(t.invitation.googleNote, vars)}</Text>
      ) : null}
      <Button href={p.url} style={styles.button}>
        {t.invitation.button}
      </Button>
      <Text style={styles.muted}>{t.invitation.expires}</Text>
    </Layout>,
  );
}

export async function contactEmail(
  lang: Lang,
  p: { name: string; email: string; message: string; newsletter: boolean },
) {
  const t = CATALOG[lang];
  return finish(
    interpolate(t.contact.subject, { name: p.name }),
    <Layout lang={lang} brand={BRAND[lang]} preview={t.contact.preview} footer={t.footer}>
      <Text style={styles.text}>{interpolate(t.contact.intro, { name: p.name, email: p.email })}</Text>
      <Text style={{ ...styles.text, whiteSpace: "pre-wrap" }}>{p.message}</Text>
      {p.newsletter ? <Text style={styles.muted}>{t.contact.newsletterYes}</Text> : null}
      <Text style={styles.muted}>{t.contact.replyHint}</Text>
    </Layout>,
  );
}

/** Aviso al personal del negocio (no esencial: lleva enlace para darse de baja). */
export async function staffNoticeEmail(
  lang: Lang,
  p: { calendar: string; text: string; url: string; unsubscribeUrl: string },
) {
  const n = NOTICES_EMAIL[lang];
  return finish(
    interpolate(n.subjects.staff, { calendar: p.calendar }),
    <Layout lang={lang} brand={BRAND[lang]} preview={n.preview} footer={CATALOG[lang].footer}>
      <Text style={styles.text}>{p.text}</Text>
      <Button href={p.url} style={styles.button}>
        {n.openPanel}
      </Button>
      <Text style={styles.muted}>
        <a href={p.unsubscribeUrl}>{n.unsubscribe}</a>
      </Text>
    </Layout>,
  );
}

/** Correo al cliente final (confirmación, cambio, cancelación o recordatorio). */
export async function customerNoticeEmail(
  lang: Lang,
  p: {
    subject: string;
    text: string;
    name?: string | null;
    address?: string | null;
    reason?: string | null;
    manageUrl: string;
    unsubscribeUrl?: string;
    buttonLabel?: string;
  },
) {
  const n = NOTICES_EMAIL[lang];
  const t = CATALOG[lang];
  return finish(
    p.subject,
    <Layout lang={lang} brand={BRAND[lang]} preview={p.subject} footer={t.footer}>
      <Text style={styles.text}>{greeting(t, p.name ?? undefined)}</Text>
      <Text style={styles.text}>{p.text}</Text>
      {p.address ? <Text style={styles.muted}>{interpolate(n.address, { address: p.address })}</Text> : null}
      {p.reason ? <Text style={styles.muted}>{interpolate(n.reason, { reason: p.reason })}</Text> : null}
      <Button href={p.manageUrl} style={styles.button}>
        {p.buttonLabel ?? n.manage}
      </Button>
      {p.unsubscribeUrl ? (
        <Text style={styles.muted}>
          <a href={p.unsubscribeUrl}>{n.unsubscribe}</a>
        </Text>
      ) : null}
    </Layout>,
  );
}

/** Aviso de seguridad: una aplicación de IA nueva se conectó a la cuenta (06-mcp.md §6.5). */
export async function aiConnectedEmail(
  lang: Lang,
  p: { app: string; domain: string; scopes: string; url: string },
) {
  const t = CATALOG[lang];
  return finish(
    interpolate(t.aiConnected.subject, { app: p.app }),
    <Layout lang={lang} brand={BRAND[lang]} preview={t.aiConnected.preview} footer={t.footer}>
      <Text style={styles.text}>{interpolate(t.aiConnected.body, p)}</Text>
      <Button href={p.url} style={styles.button}>
        {t.aiConnected.button}
      </Button>
    </Layout>,
  );
}
