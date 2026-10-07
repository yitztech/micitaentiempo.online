# 0003-connect-rpc. Connect RPC interno con JWT de actor

- Estado: aceptada
- Fecha: 2026-10-06

## Contexto

`api` aplica permisos y `calendar` decide sobre el tiempo; necesitan un contrato tipado y autenticado.

## Decisión

Protobuf + Connect (`buf`). `api` firma un JWT HS256 de 60 s con el actor; `calendar` lo valida y aplica sus propias reglas de visibilidad.

## Consecuencias

Contratos versionados con detección de cambios incompatibles en CI. Puertos internos 3001 y 8081 sin ruta en el gateway.
