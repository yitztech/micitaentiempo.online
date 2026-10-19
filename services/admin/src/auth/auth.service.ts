import type { FastifyReply, FastifyRequest } from "fastify";
import type { AdminConfig } from "../config.js";
import { type AdminDatabase, verifyPassword } from "../db/admin-db.js";

export interface AuthenticatedAdmin {
  id: string;
  username: string;
  token: string;
}

export class AuthService {
  constructor(
    private adminDb: AdminDatabase,
    private config: AdminConfig,
  ) {}

  login(
    username: string,
    password: string,
  ): { token: string; user: { id: string; username: string } } | null {
    const cleanUser = username?.trim().toLowerCase();
    if (!cleanUser || !password) return null;

    const user = this.adminDb.getUserByUsername(cleanUser);
    if (!user) return null;

    if (!verifyPassword(password, user.password_hash)) {
      this.adminDb.addAuditLog(
        "LOGIN_FAILED",
        "admin_user",
        cleanUser,
        "Intento fallido de inicio de sesión con contraseña incorrecta",
        cleanUser,
      );
      return null;
    }

    const session = this.adminDb.createSession(user.id);
    this.adminDb.addAuditLog(
      "LOGIN_SUCCESS",
      "admin_user",
      user.id,
      "Inicio de sesión exitoso en el panel de administración",
      user.username,
    );

    return {
      token: session.token,
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }

  logout(token: string, adminUser: string): void {
    if (token) {
      this.adminDb.deleteSession(token);
      this.adminDb.addAuditLog(
        "LOGOUT",
        "admin_user",
        adminUser,
        "Cierre de sesión del panel de administración",
        adminUser,
      );
    }
  }

  authenticate(req: FastifyRequest): AuthenticatedAdmin | null {
    // 1. Extrae de cabecera Authorization: Bearer <token>
    let token = "";
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }

    // 2. O de cookie admin_token
    if (!token && req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
      if (match?.[1]) {
        token = decodeURIComponent(match[1]);
      }
    }

    if (!token) return null;

    const session = this.adminDb.getSession(token);
    if (!session) return null;

    // Obtiene username del usuario
    const user = this.adminDb.getUserByUsername(this.config.initialAdminUser);
    return {
      id: session.user_id,
      username: user ? user.username : this.config.initialAdminUser,
      token: session.token,
    };
  }

  requireAuth(req: FastifyRequest, reply: FastifyReply): AuthenticatedAdmin | null {
    const admin = this.authenticate(req);
    if (!admin) {
      reply.status(401).send({ error: "No autorizado. Inicie sesión en el panel." });
      return null;
    }
    return admin;
  }
}
