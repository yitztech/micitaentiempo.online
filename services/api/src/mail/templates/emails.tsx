import { emailsEn, emailsEs, en, es, interpolate, type Lang } from "@mcet/i18n";
import { Button, Text } from "@react-email/components";
import { render } from "@react-email/render";
import { Layout, styles } from "./layout.js";

type Catalog = typeof emailsEs;
const CATALOG: Record<Lang, Catalog> = { es: emailsEs, en: emailsEn };
const BRAND: Record<Lang, string> = { es: es.site.name, en: en.site.name };

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

export async function contactEmail(lang: Lang, p: { name: string; email: string; message: string; newsletter: boolean }) {
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
