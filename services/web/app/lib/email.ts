/**
 * Valida un correo con el mismo esquema que la API (`EmailField`).
 *
 * El paquete de esquemas arrastra zod y no se necesita para pintar las páginas públicas, así que se
 * carga aparte, la primera vez que hace falta validar. El propio cargador de módulos cachea la
 * importación: llamadas posteriores no vuelven a descargarla.
 */
export async function isValidEmail(value: string): Promise<boolean> {
  const { EmailField } = await import("@mcet/schemas");
  return EmailField.safeParse(value).success;
}
