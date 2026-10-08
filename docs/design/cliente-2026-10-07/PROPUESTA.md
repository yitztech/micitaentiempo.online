# Propuesta: una reserva clara de principio a fin

## Resultado buscado

El cliente sabe con quién reserva, qué servicio eligió, cuánto dura, en qué zona horaria se muestra y qué falta para confirmarlo. Quien administra un negocio entiende la oferta y encuentra su acceso sin confundirse con quien solo quiere consultar una cita.

La propuesta abarca páginas comerciales, acceso, reserva, Mis citas y embed. Incluye lineamientos para el panel del negocio como extensión del sistema; su revisión visual autenticada queda pendiente. El alcance se basa en las rutas registradas en `services/web/app/routes.ts`, no únicamente en el plan histórico.

## Dirección y revisión del concepto

**Reserva con contexto.** Se conserva la identidad Laguna/Arena e Inter ya definida en `docs/plan/07-frontend.md`. La personalidad proviene de presentar el tiempo con precisión: fecha legible, duración, disponibilidad y próximos pasos. Las ilustraciones geométricas se limitan a explicar agenda y reserva.

Se descartó convertir cada sección en otra tarjeta con icono: ese patrón ya se repite en Inicio, Funciones e IA. La propuesta usa espacio y separadores; reserva tarjetas para una cita concreta, un plan o un formulario de acceso. También se evita resolver la falta de jerarquía cambiando la marca o añadiendo fotografías, testimonios o cifras sin evidencia.

## Sistema visual

| Elemento | Especificación |
|---|---|
| Paleta base | Laguna `#1D6F86`, Arena `#FAF8F4`, superficie `#FFFFFF`, Pizarra `#1F2A30`, secundario `#55626B`, selección `#E3F1F4` |
| Acentos existentes | Salvia y Albaricoque solo para apoyos visuales; no como texto de bajo contraste |
| Contornos | Mantener `#E4E1DA` en separadores decorativos; proponer `#7D898E` para campos y controles que necesitan un límite perceptible |
| Tipografía | Inter Variable local; cuerpo 16/24, ayuda 14/21, títulos de página 32/38 en móvil y 40/48 en escritorio; portada hasta 48/58; pesos 400, 500 y 600 |
| Lectura | Texto de explicación de 55–70 caracteres por línea; alineación izquierda en formularios y contenido funcional |
| Anchos | Público 1152 px; formulario 640 px; acceso 448 px; texto largo 70ch; calendario mensual compacto de 320–380 px, no estirado a media pantalla |
| Espaciado | Retícula de 4 px; márgenes móviles de 16 px, escritorio 24–32 px; separación de secciones 40–64 px según función |
| Forma | Radios existentes de 12 px y 10 px; sombra solo para elevación necesaria, no en cada grupo |
| Interacción | Objetivo táctil de 44 × 44 px; selección con texto/icono además de color; foco visible y no oculto por elementos fijos |
| Movimiento | 150–200 ms al abrir o cambiar estado; respetar movimiento reducido; ningún adorno animado continuo |
| Modo oscuro | Conservar tokens actuales; validar cada contorno, aviso, selección y campo en su fondo real antes de publicar |

Los contrastes calculados están en `contrastes.json`: primario/blanco 5,72:1; texto/Arena 13,82:1; secundario/Arena 5,92:1. El contorno funcional propuesto alcanza 3,60:1 sobre blanco y 3,39:1 sobre Arena. No son mediciones de cada píxel de las imágenes generadas.

## Arquitectura de navegación

La navegación pública debe distinguir tres intenciones:

- **Conocer el producto:** Funciones, Precios y Ayuda; IA como página disponible desde Funciones y pie, salvo que la estrategia comercial requiera destacarla.
- **Administrar el negocio:** «Acceso del negocio» y acción principal «Crear mi agenda».
- **Consultar una reserva:** «Mis citas», visible también en cabeceras de reserva y confirmación.

En móvil, logo y menú de 44 px; Mis citas dentro del primer grupo del menú. En la reserva, cabecera mínima con negocio, Mis citas e idioma. La identidad del negocio debe preceder visualmente al proveedor de software.

Mantener idiomas por dominio y rutas equivalentes. Las instrucciones genéricas de detección por navegador de otras guías no sustituyen el contrato de este proyecto. Mantener también oración normal en español, sin imponer Title Case anglosajón.

## Propuesta por página

| Superficie | Cambio concreto | Acción principal y estados |
|---|---|---|
| Inicio `/` | Hero más breve, demostración de reserva con contexto realista, tres beneficios prioritarios y secuencia de uso; audiencia como texto de apoyo | Crear mi agenda; enlace secundario a precios; acceso visible a Mis citas |
| Funciones | Ordenar por configurar, recibir reservas y gestionar cambios; alternar ejemplo de pantalla y explicación corta | Crear mi agenda; detalle de integraciones contextual |
| Precios | Conservar importes y límites existentes; comparación alineada, filas equivalentes y texto de cobro consistente con `features.stripe` | Empezar prueba del plan elegido; no aparentar compra disponible cuando no lo está |
| FAQ | Ancho de lectura real, acordeón nativo; grupos para negocios y clientes si ayudan a encontrar respuestas | Abrir respuesta; contacto contextual |
| Conecta tu IA | Ejemplo de tarea primero; elección del asistente antes de instrucciones; endpoint junto al paso que lo necesita | Ver cómo conectar el asistente elegido; copiar dirección |
| Contacto | Formulario de 640 px máximo, explicación breve del canal de respuesta, contornos funcionales | Enviar mensaje; enviando, enviado y error con datos preservados |
| Privacidad, condiciones y créditos | Una columna de lectura, fecha de actualización y, si el documento lo justifica, índice de secciones | Navegar secciones; revisar textos con responsable de contenido, no modificar obligaciones desde diseño |
| Entrar | «Acceso del negocio»; formulario compacto y enlace destacado a Mis citas | Entrar; error específico, recuperación y 2FA |
| Registro | Título orientado a crear la agenda del negocio, condiciones de prueba coherentes, ayuda breve | Crear cuenta; proceso, validación, correo pendiente |
| Recuperar/nueva contraseña | Un objetivo por pantalla, retorno claro al acceso y recuperación de enlace caducado | Enviar enlace / Guardar contraseña; sin filtrar existencia de cuentas |
| Verificar correo e invitación | Explicar qué falta, destinatario contextual cuando sea adecuado y siguiente paso | Reenviar/continuar/aceptar según estado; caducado y ya utilizado |
| Reserva `/reservar/:slug` | Contexto persistente, selector compacto y etapas reales | Continuar con este horario → Apartar horario y verificar → Confirmar cita |
| Mis citas `/citas` | Acceso por correo claro; próxima cita prominente, historial secundario; fecha, zona y reglas visibles | Reprogramar o añadir al calendario; cancelar como acción secundaria con confirmación |
| Embed `/embed/:slug` | Mismo flujo y componentes en el ancho del contenedor; navegación Reserva/Mis citas accesible | Misma acción de cada etapa; ajustar altura sin doble desplazamiento innecesario |
| OAuth | Aplicación solicitante y permisos comprensibles, alcance de tableros visible | Autorizar o rechazar; sin ocultar consecuencias de permisos |
| 404/errores | Título concreto y salida relevante; distinguir negocio inexistente, cerrado y fallo temporal | Volver / Reintentar / Mis citas según contexto |

No crear enlaces a `/citas/:id` o `/panel/integraciones` solo por existir en el mapa de i18n: no se registran actualmente como páginas independientes en `routes.ts`. Cualquier detalle nuevo exige definir su ruta o presentarlo dentro de la pantalla existente.

## Composición de Inicio

```text
Logo       Funciones  Precios  Ayuda       Mis citas  Acceso del negocio  Crear mi agenda

Tus clientes reservan solos.           Ejemplo de reserva
Tú atiendes.                          Servicio + duración
Explicación breve                     Fecha + hora + zona
Crear mi agenda    Ver precios        Confirmación como etapa posterior

Configura tu horario     Comparte tu enlace     Recibe reservas

Tres beneficios con prioridad visual, sin seis tarjetas equivalentes
Planes resumidos y condiciones de prueba vigentes
Preguntas clave y pie con ayuda, idiomas y legales
```

La muestra debe etiquetarse como ejemplo. No mostrar «Cita confirmada» simultáneamente con una elección pendiente como si fuera el mismo estado real. Un ejemplo interactivo puede ser una mejora posterior, con datos de demostración y sin crear reservas.

## Reserva: flujo propuesto

1. **Servicio.** Mostrar opciones con nombre, descripción breve y duración. Con un servicio, seleccionarlo y mantenerlo visible; no obligar a una confirmación redundante.
2. **Fecha y hora.** Calendario y horarios forman una sola etapa. Mostrar zona con ciudad y desfase vigente para la fecha, posibilidad de cambiar y zona del negocio si difiere. Seleccionar no crea una reserva: un botón explícito lleva a los datos.
3. **Tus datos.** Nombre y correo primero; teléfono y nota opcionales claramente marcados. Resumen de servicio, duración, fecha, hora, zona y ubicación cuando exista. Después de crear el hold, la verificación es una subetapa: indicar que el horario está apartado, el correo de destino y el tiempo restante. No anunciar el contador cada segundo al lector de pantalla.
4. **Confirmación.** Éxito solo después de respuesta confirmada del servidor. Mostrar resumen completo, Mis citas y opciones de calendario. Evitar tres botones de igual fuerza junto a la acción principal.

```text
Escritorio
Negocio y servicio | Calendario mensual compacto | Horarios
Duración          |                              | Selección y zona
Ubicación si hay  |                              | Continuar

Móvil
Negocio · servicio · duración
Paso 2 de 4 — Fecha y hora
Calendario compacto
Zona horaria y horarios
Resumen seleccionado
Continuar con este horario
```

En móvil, el resumen pasa arriba o se pliega con el texto «Ver resumen»; una barra inferior solo se fija si no tapa contenido, foco o teclado. En 320 px, mantener el ancho sin scroll lateral y reducir separaciones; conservar áreas táctiles. Un calendario puede usar celdas visuales más pequeñas si el área de interacción cumple y no se solapa.

### Estados obligatorios de la reserva

| Estado | Respuesta de interfaz |
|---|---|
| Cargando disponibilidad | Reservar el espacio del selector y anunciar carga sin saltos grandes |
| Mes sin horarios | Mensaje específico y acción «Ver siguiente mes» |
| Error de red/servidor | Mensaje de fallo y Reintentar; no presentarlo como falta de disponibilidad |
| Horario ocupado | Explicar el cambio y devolver al selector conservando servicio y datos válidos |
| Hold caducado | Retirar la selección anterior, avisar y buscar otro horario |
| Código incorrecto/caducado | Error junto al campo; reenvío con espera anunciada; permitir corregir correo |
| Sin servicios/configuración incompleta | Mensaje de indisponibilidad con salida a Mis citas; no selector vacío |
| Negocio no disponible | Texto para cliente, salida útil y contacto solo cuando esté configurado |

## Mis citas

Tras verificar el correo, priorizar la próxima cita sobre el historial. Cada cita muestra negocio, servicio, duración, fecha y hora con zona, ubicación y límite de modificación. Estado con texto e icono, no solo color.

```text
Mis citas                                  Próximas | Historial
Próxima cita
Jueves 8 de octubre · 10:30 · Ciudad de México
Consulta general · 30 min · Consultas
Reprogramar     Añadir al calendario        Cancelar
```

Al reprogramar, comparar «Horario actual» y «Nuevo horario» y guardar con una acción explícita. Al cancelar, conservar confirmación con fecha y servicio, y dar salida para volver a reservar cuando corresponda. El estado vacío explica que se muestran citas del correo verificado; no inventar un directorio de negocios. Si existe un calendario de origen conocido, ofrecer volver a su reserva.

## Extensión al panel del negocio

Esta sección es propuesta basada en el inventario y código; falta la auditoría visual con sesión autenticada.

| Área | Dirección propuesta |
|---|---|
| Bienvenida | Asistente con avance, resumen editable y vista previa del enlace de reserva |
| Panel | Próximas citas y acceso a agendas; compartir enlace como acción contextual; estado del plan sin desplazar la tarea principal |
| Calendario | Lista/día en móvil, semana/mes en escritorio; fecha, zona y agenda visibles; una acción para crear; diálogo/cajón con foco y retorno correctos |
| Ajustes y equipo | Agrupar por servicio, disponibilidad y publicación; distinguir cambios guardados de pendientes; roles en lenguaje comprensible |
| Clientes | Búsqueda, ficha y próximas citas; tablas adaptadas a móvil y acciones claramente rotuladas |
| Avisos | Pendientes y leídos, tipo con icono y texto, enlace a la cita; estados vacíos y fallos de carga |
| Cuenta y preferencias | Separar identidad, zona/idioma y canales; mostrar solo integraciones disponibles |
| IA | Permisos y conexiones existentes antes de instrucciones avanzadas |
| Facturación | Plan y estado reales; cobro disponible/próximo reflejado en acciones; sin cuenta atrás si el cobro está desactivado |

## Componentes a consolidar

`Container` con variante de ancho única; cabecera pública y de reserva; `BookingSummary`; indicador de etapas; `SlotPicker` con selección explícita; estado vacío/error/carga reutilizable; formulario de datos; estado OTP; ficha de cita; confirmación de reprogramación; aviso comercial condicionado a configuración.

Aprovechar los componentes existentes y su catálogo de traducciones. No añadir un framework de UI solo para esta propuesta: el código actual usa primitivas propias y Lucide, aunque el plan histórico mencione shadcn. Evitar que estilos de la propuesta incrementen la dependencia de JavaScript en páginas públicas.

## Implementación por fases

| Fase | Resultado verificable | Archivos principales |
|---|---|---|
| A | Anchos correctos, bordes funcionales y navegación diferenciada | `components/ui.tsx`, `app.css`, `site-header.tsx`, catálogos ES/EN |
| B | Reserva con contexto, etapas correctas y estados recuperables | `booking-flow.tsx`, `slot-picker.tsx`, `booking.tsx`, `embed.tsx`, `otp-form.tsx` |
| C | Mis citas con siguiente acción clara y revisión antes de reprogramar | `my-appointments.tsx`, rutas de acceso y catálogos |
| D | Inicio, funciones, precios, FAQ, IA y contacto con jerarquía consistente | Rutas públicas; copys condicionados a features |
| E | QA del flujo completo y auditoría del panel autenticado | Escenarios existentes, capturas comparativas y validación manual |

La selección visual precede a esas fases. Esta entrega no altera componentes, catálogos ni comportamiento de la aplicación.

## Criterios de aceptación para la futura implementación

Estos son casos pendientes, no resultados aprobados.

| ID | Caso | Resultado esperado |
|---|---|---|
| D01 | Inicio y navegación en ES/EN | Crear agenda y Mis citas se distinguen; idioma cambia a la ruta equivalente por dominio |
| D02 | Contacto y FAQ en escritorio | Ancho aplicado coincide con su variante; lectura de hasta 70ch y formulario de hasta 640 px |
| D03 | Viewports 320, 390, 768 y 1440 px | Sin desbordamiento horizontal, superposición ni controles inaccesibles |
| D04 | Claro y oscuro | Contraste de texto y controles medido; foco distinguible; selección no depende solo del color |
| D05 | Teclado | Flujo reserva/acceso completables; foco lógico tras cambiar etapa y al volver de un diálogo |
| D06 | Servicio único y varios servicios | Nombre y duración siempre visibles; cambiar servicio reinicia selección incompatible |
| D07 | Elegir fecha/hora | Etapa correcta; selección visible; continuar no anuncia reserva confirmada |
| D08 | Zonas distintas y cambio de horario estacional | Fecha/hora consistentes en selección, datos, confirmación, Mis citas e ICS; desfase calculado para la fecha |
| D09 | Datos opcionales y correo inválido | Opcionales identificados; errores junto al campo; primer error recibe foco; no se pierden datos válidos |
| D10 | Red fallida y mes vacío | Estados diferentes; Reintentar frente a Ver siguiente mes |
| D11 | Carrera por el mismo horario | Solo éxito real se muestra como confirmado; alternativa clara para el cliente que pierde el horario |
| D12 | OTP incorrecto, reenvío y hold vencido | Recuperación comprensible, correo corregible, contador sin anuncios cada segundo |
| D13 | Confirmación | Resumen completo, acciones de calendario y enlace a Mis citas; idempotencia sin confirmaciones duplicadas |
| D14 | Mis citas sin sesión, vacías, con datos y error | Acceso claro, siguiente paso útil y fallo recuperable sin spinner infinito |
| D15 | Reprogramar y cancelar | Resumen anterior/nuevo antes de guardar; confirmación de cancelación; conflictos recuperables |
| D16 | Embed estrecho y anfitrión de otro origen | Flujo legible, altura ajustada, navegación de vistas accesible y sesión dentro del iframe |
| D17 | Proveedores y cobro apagados | Botones y mensajes coherentes con configuración; sin promesas de funcionalidades activas |
| D18 | Contenido largo y zoom 200/400 % | Nombres, textos traducidos, direcciones y errores se reajustan sin pérdida de acciones |
| D19 | Acceso y enlaces caducados | Recuperación clara en verificación, invitación y restablecimiento; retorno al destino permitido |
| D20 | Rendimiento | Medir presupuesto de JS del plan, LCP/INP/CLS; capturas no sustituyen estas métricas |

Validar con los escenarios existentes de Playwright, axe y una pasada manual de teclado/lector de pantalla; registrar URLs, idioma, viewport, estado y capturas de cada caso. Probar Safari/iOS y Chrome/Android físicos antes de declarar calidad móvil final.
