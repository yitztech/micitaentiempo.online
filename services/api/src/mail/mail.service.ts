import type { Lang } from "@mcet/i18n";
import { Inject, Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";

export interface MailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

export interface MailMessage {
  lang: Lang;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
  headers?: Record<string, string>;
  replyTo?: string;
}

/** Correo transaccional con el remitente y las credenciales del dominio del idioma (README). */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transports: Record<Lang, { transporter: Transporter; from: string }>;

  constructor(@Inject(ENV) env: Env) {
    const make = (user: string, pass: string) =>
      nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: { user, pass },
      });
    this.transports = {
      es: {
        transporter: make(env.SMTP_USER_ES ?? env.SMTP_USER, env.SMTP_PASSWORD_ES ?? env.SMTP_PASSWORD),
        from: env.MAIL_FROM_ES ?? env.MAIL_FROM,
      },
      en: { transporter: make(env.SMTP_USER_EN, env.SMTP_PASSWORD_EN), from: env.MAIL_FROM_EN },
    };
  }

  /** Buzón del dominio del idioma (el remitente): recibe los mensajes de contacto. */
  inbox(lang: Lang): string {
    return this.transports[lang].from;
  }

  async send(msg: MailMessage): Promise<void> {
    const { transporter, from } = this.transports[msg.lang];
    await transporter.sendMail({
      from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      attachments: msg.attachments,
      headers: msg.headers,
      replyTo: msg.replyTo,
    });
    this.logger.log({ lang: msg.lang, subject: msg.subject }, "correo enviado");
  }
}
