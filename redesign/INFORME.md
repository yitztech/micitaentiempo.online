# Informe del rediseño

## 1. Recursos (`src/assets/manifest.json`, 22 entradas, 0 faltantes)

| Recurso | Formato | Estado |
|---|---|---|
| Logotipo horizontal (claro y oscuro), isotipo, isotipo claro, favicon | SVG | Generados (vectoriales) |
| Decoraciones: destello, resplandor del hero, rejilla, fondo CTA | SVG | Generadas |
| 8 avatares (iniciales) | SVG | Generados |
| Foto hero (480w, 960w) y foto de negocio (640w, 1100w) | WebP | **Provisionales**: recortadas de la lámina (1254 px); resolución real 160–250 px reescalada |
| Iconos de categorías | Lucide | Sin archivos propios (componentes) |

**Faltan (no hay herramienta de generación de imágenes aquí):** fotografías originales de profesionales en alta
resolución (hero, negocio, categorías, directorio) y rostros reales para avatares/testimonios. Las fotos actuales
se ven blandas en pantallas grandes. Los logotipos SVG llevan el texto como `<text>` (Inter); conviene
convertirlo a trazos para uso fuera de la app.

## 2. Componentes

`ui/`: Button, Card, Badge, Input/Field/Textarea, Select, Dialog, Tabs, Tooltip, Skeleton, EmptyState, Switch, Avatar, Logo.
`layout/`: PublicHeader/Footer/Layout, AuthLayout, DashboardSidebar/Header/Layout, MobileNavigation.
`booking/`: BookingCalendar, AppointmentCard, TimeSlotPicker, BookingCard/NewBookingNotice.
`business/`: BusinessCard, CategoryCard, ProfessionalCard.
`dashboard/`: MetricCard, ActivityFeed, UpcomingAppointments, CalendarOverview, BookingLinkCard.

## 3. Páginas

Inicio, Funciones, Precios (US$5 Personal / US$20 Sucursales, tomados de `packages/i18n`), Directorio (búsqueda,
categoría, localidad, carga, vacío), Ingresar, Registro, Recuperar, Restablecer, y panel: Inicio, Calendario, Clientes,
Avisos, Preferencias de avisos, Perfil del negocio, Facturación, Integraciones de IA, Cuenta.

## 4. Pruebas (ejecutadas)

- `tsc`: sin errores. `biome check` del monorepo: sin diagnósticos en `redesign/`.
- Playwright: **35/35** (axe WCAG 2.0/2.1/2.2 A y AA en 17 páginas; sin desbordamiento horizontal en 375, 768,
  1024, 1440 y 1920 px; calendario, FAQ, filtros, validación de formularios, login, recuperación, diálogos,
  navegación móvil, interruptores, objetivos táctiles ≥ 44 px y movimiento reducido).
- Lighthouse (móvil, vista previa de producción): inicio 96/98/100, directorio 100/98/100, precios 100/100/100,
  ingresar 98/100/100 (rendimiento/accesibilidad/buenas prácticas). Objetivo 90/95/95 cumplido. LCP del inicio 2,8 s.
- Capturas: 85 en `capturas/` (17 páginas × 375×812, 768×1024, 1024×768, 1440×900, 1920×1080).
  Orientación horizontal solo cubierta por 1024×768; no se probó móvil apaisado.

## 5. Diferencias pendientes frente a la referencia

- Fotografías: menor calidad y encuadre distinto (la referencia usa fotos nuevas de 1 profesional con tableta).
- Los avatares son iniciales, no rostros.
- Selector de idioma «ES ⌄»: se sustituyó por un enlace «EN» al dominio en inglés (el idioma lo decide el dominio).
- Sidebar del panel: usa las secciones reales del producto, no Citas/Servicios/Pagos/Marketing/Reportes de la lámina.
- Métricas: «Clientes nuevos» sustituye a «Ingresos del mes» (no hay datos de pagos que lo respalden).

## 6. Problemas conocidos

- **Datos estáticos**: no hay API; formularios y paneles simulan el envío. No se conserva lógica de negocio porque
  este proyecto es la capa visual; integrar en `services/web` es un paso posterior (pasar tokens y componentes).
- Afirmaciones de la lámina por verificar con producto: cifras de la franja (2,500+, 120,000+, 99.9 %, 200+),
  «Pagos en línea (opcional)» y recordatorios por WhatsApp.
- Bundle JS de 663 kB (205 kB gzip) en un solo chunk; falta `import()` por ruta.
- `vite preview`/Playwright necesitan abrir puertos locales (no funcionan dentro del sandbox de Claude Code).
