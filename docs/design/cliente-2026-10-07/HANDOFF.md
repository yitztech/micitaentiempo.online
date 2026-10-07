# Traspaso: implementar la propuesta de frontend del cliente

Documento para el siguiente agente. Léelo completo antes de tocar código. Fecha de traspaso: 7 de octubre de 2026.

## 1. Estado actual
 
| Aspecto | Estado |
|---|---|
| Rama | `design/propuesta-frontend-cliente` |
| Código de la app | **Implementado y verificado en su totalidad (Fases A–E).** |
| Auditoría | Hecha: 14 capturas + 12 hallazgos de código ([AUDITORIA.md](AUDITORIA.md)) |
| Propuesta | Sistema visual, páginas, flujo de reserva, fases A–E, criterios D01–D20 ([PROPUESTA.md](PROPUESTA.md)) |
| Concepto visual | Implementado concepto 1: «Agenda con contexto» |
| Pruebas y QA | 100% aprobadas: Biome lint, TypeScript typecheck, Go tests, unit tests y escenarios Playwright BDD |


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

- [x] **B1. Etapas reales** — `booking-flow.tsx`: mapa unificado de 4 etapas (`Servicio`, `Fecha y hora`, `Tus datos`, `Confirmación`) en `b.steps` (es y en) e índice coincidente.
- [x] **B2. Contexto siempre visible** — `booking-flow.tsx`: el servicio y su duración se muestran siempre de forma persistente aunque exista un único servicio.
- [x] **B3. Resumen completo** — `booking-flow.tsx`: duración y zona horaria explícitas en el resumen en `details`, `verify` y `done`.
- [x] **B4. Error ≠ sin horarios** — `slot-picker.tsx`: diferenciación clara de error de red con botón Reintentar vs. mes sin horarios con botón «Ver siguiente mes».
- [x] **B5. Selección explícita** — `slot-picker.tsx`: seleccionar un horario lo resalta y muestra botón «Continuar con este horario» para avanzar deliberadamente.
- [x] **B6. Campos con `name`** y atributos semánticos — `booking-flow.tsx`: `name="name"`, `name="email"`, `name="phone"`, `name="notes"`.
- [x] **B7. Foco al cambiar de etapa** — `booking-flow.tsx`: desplazamiento de foco accesible (`ref` y `tabIndex={-1}`) al título de la nueva etapa.
- [x] **B8. Estados obligatorios** — `booking-flow.tsx`: contemplados negocio no disponible, sin servicios configurados, hold caducado con aviso y contador temporal sin contaminación de anuncios periódicos.
- [x] **B9. Embed** — `routes/embed.tsx`: navegación de vistas con botones táctiles de 44 px (min-h-11) y `aria-pressed` sin roles ARIA rotos.
- [x] **B10. Calendario compacto** — `slot-picker.tsx`: calendario mensual restringido a 320–360 px en rejilla responsiva.


### Fase C — Mis citas

Archivos: `components/my-appointments.tsx`, `routes/my-appointments.tsx`.

- [x] **C1. Error recuperable** — `my-appointments.tsx`: diferenciación entre 401 y errores de carga con mensaje descriptivo y botón Reintentar para evitar bloqueos.
- [x] **C2. Reprogramar con revisión** — `my-appointments.tsx`: selección de slot despliega comparativa de horario actual vs. nuevo con botones de confirmación y cancelación de la operación.
- [x] **C3.** Próxima cita priorizada con distinción visual y distintivo (`Badge`), historial secundario y confirmación previa a la cancelación.


### Fase D — páginas públicas

- [x] **D. Páginas públicas con jerarquía consistente** — Inicio, Funciones, Precios, FAQ, Conecta tu IA y Contacto adaptadas:
  - Precios refleja con precisión el estado de `features.stripe` sin aparentar cobro activo cuando no lo está.
  - Formulario de contacto limitado a 640 px con borde funcional de 3:1 y estados claros.
  - FAQ con ancho de lectura legible (`prose`) y acordeones semánticos nativos accesibles.
  - Inicio con bordes de 3:1 en previsualización de horarios, accesos a «Crear mi agenda», «Precios» y «Mis citas».
  - Acceso del negocio con enlace a «Mis citas» para evitar confusión de clientes finales.
  - Verificados los 23 escenarios de páginas públicas, presupuesto JS (126 KB < 130 KB) y accesibilidad con axe (0 fallos).


### Fase E — QA y verificación completada

- [x] **E1. Validación de criterios de aceptación D01–D20**:
  - D01–D03: Comprobados anchos (390, 768, 1024, 1440 px) sin desbordamiento horizontal y navegación diferenciada en ES/EN.
  - D04–D05: Contraste no textual validado (tokens `--color-border-field` ≥3:1 en claro y oscuro) y foco de teclado en avance de etapas.
  - D06–D08: Servicio persistente con duración, etapas unificadas y zonas horarias explícitas.
  - D09–D13: Selección deliberada con botón «Continuar con este horario», atributos `name`, estados de error vs. mes vacío y resumen de confirmación con exportación ICS.
  - D14–D15: Mis citas con recuperación ante fallo de red (sin spinner infinito), panel de revisión previo a reprogramar y confirmación de cancelación.
  - D16: Embed con controles accesibles de 44 px y `aria-pressed`.
  - D17–D20: Presupuesto JS verificado (126 KB en portada, cumpliendo límite <130 KB) y suite de axe sin violaciones graves o críticas (0 errores).
- [x] **E2. Capturas actualizadas**: Regeneradas las capturas de la auditoría en `docs/design/cliente-2026-10-07/capturas/` directamente sobre el build actualizado.
- [x] **E3. Suite completa de pruebas**: Pasaron todas las pruebas unitarias, Go (`services/calendar`) y los escenarios de Playwright BDD (`reserva-ui.feature`, `paginas-publicas.feature`, `dominios.feature`, `panel.feature`, `cuentas.feature`, `mcp.feature`, etc.).


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
