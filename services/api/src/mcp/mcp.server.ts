import { interpolate } from "@mcet/i18n";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { z } from "zod";
import { MCP_TEXT, type McpCaller, type McpDeps, runTool, TOOLS } from "./tools.js";

const SERVER_NAME = { es: "Mi Cita en Tiempo", en: "My Appointment On Time" } as const;

/**
 * Servidor MCP de una petición (sin estado): herramientas, recursos y prompts en el idioma del
 * dominio, actuando como el usuario que conectó la aplicación (docs/plan/06-mcp.md §6.4).
 */
export function buildMcpServer(c: McpCaller, d: McpDeps): McpServer {
  const text = MCP_TEXT[c.lang];
  const server = new McpServer(
    {
      name: "mi-cita-en-tiempo",
      title: SERVER_NAME[c.lang],
      version: d.env.RELEASE_SHA,
      websiteUrl: d.env.site.siteUrl[c.lang],
    },
    { instructions: text.instructions, capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  // Orden determinista: el de TOOLS.
  for (const spec of TOOLS) {
    server.registerTool(
      spec.name,
      {
        title: spec.title[c.lang],
        description: spec.description,
        inputSchema: spec.input,
        outputSchema: spec.output,
        annotations: {
          title: spec.title[c.lang],
          readOnlyHint: !spec.write,
          destructiveHint: Boolean(spec.write && spec.destructive),
          idempotentHint: Boolean(spec.idempotent || !spec.write),
          openWorldHint: false,
        },
        // ChatGPT lee el esquema de seguridad de cada herramienta.
        _meta: {
          securitySchemes: [{ type: "oauth2", ...(spec.scope ? { scopes: [spec.scope] } : {}) }],
        },
      },
      ((args: unknown) => runTool(spec, args, c, d)) as never,
    );
  }

  server.registerResource(
    "help",
    new ResourceTemplate("mcet://help/{topic}", {
      list: async () => ({
        resources: text.help.map((h) => ({
          uri: `mcet://help/${h.id}`,
          name: h.id,
          title: h.title,
          mimeType: "text/markdown",
        })),
      }),
    }),
    { title: c.lang === "es" ? "Ayuda" : "Help", mimeType: "text/markdown" },
    async (uri, vars) => {
      const h = text.help.find((x) => x.id === String(vars.topic));
      return {
        contents: h ? [{ uri: uri.href, mimeType: "text/markdown", text: `# ${h.title}\n\n${h.body}` }] : [],
      };
    },
  );

  server.registerResource(
    "calendar-settings",
    new ResourceTemplate("mcet://calendars/{id}/settings", {
      list: async () => {
        if (!c.scopes.has("calendar:read")) return { resources: [] };
        const cals = await d.calendars.list(c.user);
        return {
          resources: cals.map((cal) => ({
            uri: `mcet://calendars/${cal.id}/settings`,
            name: `calendar-${cal.id}`,
            title: cal.name,
            mimeType: "application/json",
          })),
        };
      },
    }),
    { title: c.lang === "es" ? "Ajustes del tablero" : "Board settings", mimeType: "application/json" },
    async (uri, vars) => {
      const spec = TOOLS.find((t) => t.name === "get_calendar_settings");
      const res = spec ? await runTool(spec, { calendar_id: String(vars.id) }, c, d) : undefined;
      return {
        contents:
          res && !res.isError
            ? [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(res.structuredContent) }]
            : [],
      };
    },
  );

  const prompt = (
    name: keyof typeof text.prompts,
    args: z.ZodObject<Record<string, z.ZodType<string | undefined>>>,
  ) => {
    const p = text.prompts[name];
    server.registerPrompt(name, { title: p.title, description: p.description, argsSchema: args }, (a) => ({
      description: p.description,
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: interpolate(p.text, a as Record<string, string>) },
        },
      ],
    }));
  };
  const Calendar = z.string().describe(c.lang === "es" ? "Tablero (nombre o id)" : "Board (name or id)");
  const Day = z.string().describe("YYYY-MM-DD");
  prompt("weekly_summary", z.object({ calendar: Calendar, from: Day, to: Day }));
  prompt("plan_my_day", z.object({ calendar: Calendar, date: Day }));
  prompt("reschedule_day", z.object({ calendar: Calendar, date: Day }));

  return server;
}
