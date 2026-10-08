# Validación de la propuesta

> Actualización del 7 de octubre de 2026: este documento conserva la validación de la propuesta original. La implementación y sus comprobaciones posteriores están en [QA.md](QA.md). Los pendientes y límites que siguen describen la entrega original, no el estado actual.

## Skills aplicadas

- **Product Design: audit**: captura, inspección y notas asociadas a cada pantalla. Se conservaron 14 capturas válidas; la captura de Mis citas durante carga fue reemplazada por su estado estable.
- **Frontend Design**: dirección ligada al producto, sistema compacto de color/tipografía/distribución y autocrítica de patrones repetitivos.
- **Product Design: get-context e ideate**: brief derivado de rutas y documentación; tres alternativas del mismo recorrido, conservando identidad. Pendiente selección del usuario para implementar.
- **ImageGen**: tres imágenes independientes con una captura actual como referencia adjunta, guardadas en el proyecto; prompts conservados.
- **Web Design Guidelines**: revisión de componentes, etiquetas, foco, formularios, estados y adaptación. Fuente consultada en esta sesión: [guías de interfaces de Vercel](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).

Se priorizaron las restricciones específicas del proyecto ante guías genéricas: idioma por dominio, Inter autoalojada, paleta existente, tono español y ausencia de contenido comercial inventado.

## Comprobado

| Comprobación | Evidencia | Resultado |
|---|---|---|
| Rama aislada | `git status --short --branch` | `design/propuesta-frontend-cliente`; base `cfb28fa` |
| Aplicación local accesible | Entorno `mcet-ci`, Chrome | Páginas públicas, reserva disponible/no disponible, datos y acceso a Mis citas visibles |
| Recorrido de selección | Capturas 07 y 08 | Seleccionar hora abre Tus datos; Cambiar permite volver al selector |
| Adaptación observada | Capturas 05–09 | Registro e inicio en móvil; reserva en móvil y escritorio; sin certificación de todos los anchos |
| Teclado en FAQ | Captura 11 | Primera respuesta abierta con Enter; foco visible |
| Tamaño de campos | `mediciones-contacto.json` | Campos de 44 px de alto y texto de 16 px; ancho incorrectamente extendido a 1104 px |
| Contraste de tokens | `contrastes.json` | Texto/primario adecuados en pares medidos; borde de campo actual 1,31:1 sobre blanco |
| Propuestas visuales | `propuestas/01…03*.png` | Tres conceptos legibles con servicio, duración, zona y acción principal |

## Revisión crítica de las imágenes

Las imágenes expresan una distribución y jerarquía, no un contrato píxel a píxel. Las fechas y horas son ejemplos ficticios anclados al 7 de octubre de 2026.

Se solicitaron conceptos de 1440 × 1024; ImageGen entregó 1487 × 1058. Se conservaron sin escalarlos. Las capturas del navegador llegaron como JPEG y se guardaron con extensión `.jpg`, conservando sus bytes originales. El inventario de dimensiones y hashes está en `validacion-artifactos.json`.

- **Concepto 1:** conserva visión mensual y contexto. Implementar correctamente días pasados/deshabilitados, reforzar estado seleccionado con texto y simplificar la duplicación de selector de zona más Cambiar. El calendario aún puede compactarse.
- **Concepto 2:** reduce densidad mensual y favorece reservas cercanas. Hacer visibles anterior/siguiente semana; no habilitar fechas pasadas; sustituir iconografía médica por la apropiada al negocio o por un icono neutro. No copiar flechas decorativas del botón como requisito.
- **Concepto 3:** permite comparar próximas fechas. Limitar slots iniciales y conservar búsqueda de otra fecha. El enlace adicional «Próximo horario» generado puede eliminarse si resulta redundante.
- **Común:** el generador introduce matices de color/textura que deben sustituirse por los tokens exactos del proyecto. Las maquetas no acreditan contraste, área táctil, comportamiento responsive o accesibilidad; eso se valida en la implementación.

## Límites y trabajo pendiente

No se ejecutaron nuevos tests de aplicación, porque la entrega modifica únicamente documentación y recursos de diseño. No se declara aprobación de CI, accesibilidad WCAG, rendimiento, producción o dispositivos físicos.

La revisión visual usa las imágenes locales de CI existentes, cuyo `/version.json` devuelve `ci`; los assets compilados no son una prueba del SHA del checkout. La auditoría está corroborada con fuentes actuales cuando se indica, pero requiere repetir capturas sobre el build de la futura implementación.

No se completaron OTP, alta, panel con sesión, confirmación, reprogramación ni cancelación. Tampoco se probaron inglés, modo oscuro, 320/768 px, zoom, lector de pantalla, estados de red inducidos o embed en otro origen. Los 20 casos de aceptación de `PROPUESTA.md` cubren esas comprobaciones futuras.

Se arrancaron los ocho contenedores existentes del proyecto `mcet-ci` para inspeccionar la aplicación. No se cambiaron sus configuraciones ni se desplegó el sitio. El navegador se desconectó durante la navegación hacia Privacidad; esa pantalla no se incluyó como evidencia visual.
