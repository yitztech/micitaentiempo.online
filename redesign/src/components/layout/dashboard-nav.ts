import {
  Bell,
  BellRing,
  Building2,
  CalendarDays,
  CreditCard,
  Home,
  type LucideIcon,
  Sparkles,
  UserCog,
  UsersRound,
} from "lucide-react";

export type PanelItem = { to: string; label: string; icon: LucideIcon; end?: boolean; badge?: number };

/** Secciones del panel (las mismas rutas que el producto actual). */
export const panelItems: PanelItem[] = [
  { to: "/panel", label: "Inicio", icon: Home, end: true },
  { to: "/panel/calendario", label: "Calendario", icon: CalendarDays },
  { to: "/panel/clientes", label: "Clientes", icon: UsersRound },
  { to: "/panel/avisos", label: "Avisos", icon: Bell, badge: 2 },
  { to: "/panel/preferencias-avisos", label: "Preferencias de avisos", icon: BellRing },
  { to: "/panel/negocio", label: "Perfil del negocio", icon: Building2 },
  { to: "/panel/facturacion", label: "Facturación", icon: CreditCard },
  { to: "/panel/ia", label: "Integraciones de IA", icon: Sparkles },
  { to: "/panel/cuenta", label: "Cuenta", icon: UserCog },
];
