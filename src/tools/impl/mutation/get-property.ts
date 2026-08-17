import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { describeResponse, sendAndWait, sourceWithThreadContext } from "../../factory.js";
import { maxOutputCharsSchema, threadContextSchema } from "../../schemas.js";
import { luaStringLiteral } from "./lua-literals.js";

export default function register(server: McpServer): void {
  server.registerTool(
    "get-property",
    {
      title: "Get instance property",
      description:
        "Read a single property (or attribute) off a Roblox Instance. Prefer this over get-data-by-code for simple reads — it is cheaper and less error-prone than hand-writing a Luau probe.",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            "Lua expression that resolves to the target Instance, e.g. 'game.Workspace.Part' or 'game:GetService(\"Players\").LocalPlayer.Character'."
          ),
        property: z
          .string()
          .describe(
            "Property name to read, e.g. 'Transparency', 'CanCollide', 'Name'. Prefix with '@' to read an attribute instead (e.g. '@QuestId')."
          ),
        threadContext: threadContextSchema,
        maxOutputChars: maxOutputCharsSchema,
      }),
    },
    async ({ path, property, threadContext, maxOutputChars }) => {
      const isAttribute = property.startsWith("@");
      const propName = isAttribute ? property.slice(1) : property;
      const propLiteral = luaStringLiteral(propName);
      const accessor = isAttribute
        ? `__inst:GetAttribute(${propLiteral})`
        : `__inst[${propLiteral}]`;

      const code = [
        `local __inst = (${path})`,
        `if typeof(__inst) ~= "Instance" then`,
        `  error("path did not resolve to an Instance (got " .. typeof(__inst) .. ")")`,
        `end`,
        `return ${accessor}`,
      ].join("\n");

      return sendAndWait({
        type: "get-data-by-code",
        data: { source: sourceWithThreadContext(code, threadContext) },
        maxOutputChars,
        stampClient: true,
        truncationHint: "Pass a smaller maxOutputChars, or read fewer properties at once.",
        failureMessage: (response) =>
          `Failed to get property '${property}': ` + describeResponse(response),
      });
    }
  );
}
