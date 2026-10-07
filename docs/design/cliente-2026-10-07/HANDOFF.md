# Traspaso: implementar la propuesta de frontend del cliente

Documento para el siguiente agente. Léelo completo antes de tocar código. Fecha de traspaso: 7 de octubre de 2026.

## 1. Estado actual

| Aspecto | Estado |
|---|---|
| Rama | `design/propuesta-frontend-cliente` (base `cfb28fa` = `main`) |
| Código de la app | **Sin cambios.** Esta carpeta solo contiene documentación e imágenes |
| Auditoría | Hecha: 14 capturas + 12 hallazgos de código ([AUDITORIA.md](AUDITORIA.md)) |
| Propuesta | Hecha: sistema visual, páginas, flujo de reserva, fases A–E, criterios D01–D20 ([PROPUESTA.md](PROPUESTA.md)) |
| Concepto visual | **Pendiente de elección por el usuario.** Recomendado: concepto 1, «Agenda con contexto» ([README.md](README.md)) |
| Implementación | No iniciada |

> **Antes de implementar la fase B** confirma con el usuario el concepto visual (1, 2 o 3). La fase A es independiente del concepto y puede empezar ya.

## 2. Lectura obligatoria (en este orden)

1. `CLAUDE.md` (raíz): reglas del repo. Las críticas para esta tarea:
   - Todo texto visible va en `packages/i18n` **en es y en**. Nunca texto literal en componentes.
   - El idioma lo decide el dominio, nunca `Accept-Language`.
   - Cada cambio de comportamiento lleva su prueba; cada requisito, su escenario (`tests/escenarios`, Gherkin en español).
   - Repositorio público: sin secretos.
2. `docs/plan/07-frontend.md`: identidad Laguna/Arena, Inter autoalojada, presupuesto de JS.
3. [PROPUESTA.md](PROPUESTA.md) y la sección «Hallazgos de código» de [AUDITORIA.md](AUDITORIA.md).
4. [VALIDACION.md](VALIDACION.md) § «Límites y trabajo pendiente».

No añadir librerías de UI (shadcn, etc.): el proyecto usa primitivas propias en `components/ui.tsx` y Lucide.

## 3. Tareas pendientes, ordenadas

Rutas relativas a `services/web/app/`. Los números de línea se comprobaron sobre `cfb28fa`; vuelve a comprobarlos si la rama avanza.

### Fase A — base visual (no depende del concepto elegido)

- [x] **A1. Ancho de `Container`** — `components/ui.tsx:66-68`. Siempre aplica `max-w-6xl` y `cx` solo concatena, así que un `className="max-w-xl"` no lo anula (Contacto mide 1104 px). Añadir prop `width?: "page" | "form" | "auth" | "prose" | "booking"` → 1152 px / 640 px / 448 px / `70ch` / 896 px. Revisado y aplicado en `contact.tsx`, `faq.tsx`, `legal.tsx`, `booking.tsx` y `my-appointments.tsx`.
- [x] **A2. Borde funcional de campos** — `components/ui.tsx:130-131` (`inputClass` usa `border-border`, 1,31:1). Creado token `--color-border-field: #7D898E` (3,60:1 sobre blanco) en `app.css`, con su valor para modo oscuro (`#6b818a`), y usado en campos, selects y controles. Mantener `--color-border` para separadores decorativos.
- [x] **A3. Navegación diferenciada** — `components/site-header.tsx` y catálogos i18n: «Mis citas» visible (también en el menú móvil, primer grupo), «Acceso del negocio» en lugar del «Entrar» genérico y la acción principal «Crear mi agenda». Equivalentes en inglés. Pie actualizado con enlace a Mis citas.
- [x] **A4. Enlace de salto** en la cabecera de la reserva — `routes/booking.tsx:28` y `my-appointments.tsx` usando `ClientHeader` con enlace `#contenido`, logo, Mis citas e idioma.


### Fase B — reserva (requiere concepto elegido)

Archivos: `components/booking-flow.tsx`, `components/slot-picker.tsx`, `components/otp-form.tsx`, `routes/booking.tsx`, `routes/embed.tsx`.

- [ ] **B1. Etapas reales** — `booking-flow.tsx:171`: el mapa `{ service: 0, slot: 2, ... }` salta el índice 1 (Día). Unificar fecha y hora en una etapa y ajustar `b.steps` en i18n (4 etapas: Servicio, Fecha y hora, Tus datos, Confirmación).
- [ ] **B2. Contexto siempre visible** — `booking-flow.tsx:223`: el servicio solo se muestra si hay más de uno. Mostrar siempre nombre + duración.
- [ ] **B3. Resumen completo** — `booking-flow.tsx:145`: añadir duración y zona horaria (ciudad + desfase de esa fecha) en datos, verificación y confirmación.
- [ ] **B4. Error ≠ sin horarios** — `slot-picker.tsx:57-59`: `!r.ok` y `.catch` acaban en `slots: []`. Añadir estado `error` con botón Reintentar; «Ver siguiente mes» solo para mes vacío.
- [ ] **B5. Selección explícita**: elegir una hora no avanza sola; botón «Continuar con este horario».
- [ ] **B6. Campos con `name`** y errores asociados — `booking-flow.tsx:269`.
- [ ] **B7. Foco al cambiar de etapa** — `booking-flow.tsx:251`: mover foco al título de la nueva etapa (`tabIndex={-1}`) y anunciarlo.
- [ ] **B8. Estados obligatorios**: ver la tabla «Estados obligatorios de la reserva» en PROPUESTA.md (hold caducado, horario ocupado, OTP incorrecto, sin servicios, negocio no disponible). El contador del hold no debe anunciarse cada segundo (`aria-live` solo en cambios relevantes).
- [ ] **B9. Embed** — `routes/embed.tsx:58`: `role=tab` sin `tabpanel` ni flechas y controles de 40 px. Completar el patrón ARIA de pestañas o pasar a botones simples de 44 px.
- [ ] **B10. Calendario compacto** en escritorio (320–380 px, sin estirarse a media pantalla).

### Fase C — Mis citas

Archivos: `components/my-appointments.tsx`, `routes/my-appointments.tsx`.

- [ ] **C1. Error recuperable** — `my-appointments.tsx:30` y `:65`: un error distinto de 401 deja `signedIn = null` y la pantalla se queda cargando para siempre. Añadir estado de error con Reintentar.
- [ ] **C2. Reprogramar con revisión** — `my-appointments.tsx:173`: elegir hora lanza la mutación al momento. Mostrar «Horario actual» frente a «Nuevo horario» y guardar con un botón.
- [ ] **C3.** Próxima cita destacada, historial secundario, estado con texto e icono y cancelación con confirmación.

### Fase D — páginas públicas

Inicio, Funciones, Precios, FAQ, Conecta tu IA y Contacto según la tabla «Propuesta por página» de PROPUESTA.md. Puntos que se olvidan fácilmente:
- Precios no debe aparentar que se puede comprar si `features.stripe` está apagado.
- No inventar testimonios, cifras ni fotos.
- No enlazar `/citas/:id` ni `/panel/integraciones`: no existen en `routes.ts`.

### Fase E — QA y lo que falta auditar

- [ ] Auditoría visual del **panel con sesión** (no se hizo nunca).
- [ ] Recorridos no capturados: OTP, alta, confirmación, reprogramar, cancelar, Privacidad, recuperación e invitación.
- [ ] Inglés (`myappointmentontime.localhost`), modo oscuro, 320/390/768/1440 px, zoom al 200/400 %, teclado y lector de pantalla.
- [ ] Embed dentro de un iframe de otro origen.
- [ ] Repetir las capturas de la auditoría sobre el build nuevo; las actuales salieron de las imágenes de CI, no del checkout.
- [ ] Recorrer los criterios **D01–D20** de PROPUESTA.md y anotar URL, idioma, viewport y resultado.

## 4. Cómo verificar cada fase

```bash
pnpm install
docker compose up --watch          # http://micitaentiempo.localhost:8080
pnpm lint && pnpm typecheck && pnpm test
pnpm escenarios                    # playwright-bdd + axe, en tests/escenarios
```

- Escenarios nuevos en `tests/escenarios/features/` (Gherkin en español), uno por estado nuevo (p. ej. error de disponibilidad, revisión antes de reprogramar).
- Comprobar que el JS de las páginas públicas sigue dentro del presupuesto de `docs/plan/07-frontend.md`.

## 5. Convenciones de entrega

- Un commit por fase (o por tarea grande), con mensaje en español al estilo del historial: `Diseño A: anchos de contenedor, borde funcional y navegación diferenciada`.
- Marca las casillas de este documento al terminar cada tarea y anota aquí cualquier desviación de la propuesta.
- No borres ni reescribas AUDITORIA.md ni PROPUESTA.md: son el registro de la decisión. Si una decisión cambia, añade una nota fechada.
- Si introduces un patrón de arquitectura nuevo, escribe un ADR en `docs/adr/`.

## 6. Archivos de esta carpeta

| Archivo | Para qué sirve |
|---|---|
| `README.md` | Resumen y los 3 conceptos visuales |
| `PROPUESTA.md` | Especificación que hay que implementar |
| `AUDITORIA.md` | Problemas encontrados, con capturas y líneas de código |
| `VALIDACION.md` | Qué se comprobó y qué no |
| `PROMPTS.md` | Prompts de las imágenes de concepto |
| `contrastes.json`, `mediciones-contacto.json` | Mediciones de apoyo |
| `validacion-artifactos.json` | Hashes y dimensiones de las imágenes |
| `capturas/`, `propuestas/` | Capturas actuales y conceptos (solo referencia, no son contrato pixel a pixel) |
