import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { describeResponse, sendAndWait, sourceWithThreadContext } from "../../factory.js";
import { maxOutputCharsSchema, threadContextSchema } from "../../schemas.js";
import { jsValueToLuaLiteral, luaStringLiteral } from "./lua-literals.js";

const simpleValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export default function register(server: McpServer): void {
  server.registerTool(
    "set-property",
    {
      title: "Set instance property",
      description:
        "Write a single property (or attribute) on a Roblox Instance and return its old/new value. Use 'value' for plain string/number/boolean/null values, or 'valueCode' (a raw Lua expression) for Roblox-specific types such as Vector3, CFrame, Color3, UDim2, or Enum members. This mutates live game state — verify the target path first with get-property or search-instances.",
      inputSchema: z
        .object({
          path: z
            .string()
            .describe(
              "Lua expression that resolves to the target Instance, e.g. 'game.Workspace.Part' or 'game:GetService(\"Players\").LocalPlayer.Character'."
            ),
          property: z
            .string()
            .describe(
              "Property name to set, e.g. 'Transparency', 'CanCollide', 'Name'. Prefix with '@' to set an attribute instead (e.g. '@QuestId')."
            ),
          value: simpleValueSchema
            .optional()
            .describe(
              "New value for plain string/number/boolean/null properties. Omit and use 'valueCode' for Roblox-specific types."
            ),
          valueCode: z
            .string()
            .optional()
            .describe(
              "Lua expression producing the new value, e.g. 'Vector3.new(0, 10, 0)', 'Enum.Material.Neon', or 'Color3.fromRGB(255, 0, 0)'. Takes precedence over 'value' when both are given."
            ),
          threadContext: threadContextSchema,
          maxOutputChars: maxOutputCharsSchema,
        })
        .refine((data) => data.value !== undefined || data.valueCode !== undefined, {
          message: "Provide either 'value' or 'valueCode'.",
          path: ["value"],
        }),
    },
    async ({ path, property, value, valueCode, threadContext, maxOutputChars }) => {
      const isAttribute = property.startsWith("@");
      const propName = isAttribute ? property.slice(1) : property;
      const propLiteral = luaStringLiteral(propName);

      let valueExpr: string;
      try {
        valueExpr = valueCode !== undefined ? valueCode : jsValueToLuaLiteral(value ?? null);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Invalid value: ${(err as Error).message}` }],
          isError: true,
        };
      }

      const readExpr = isAttribute
        ? `__inst:GetAttribute(${propLiteral})`
        : `__inst[${propLiteral}]`;
      const writeStmt = isAttribute
        ? `__inst:SetAttribute(${propLiteral}, __newValue)`
        : `__inst[${propLiteral}] = __newValue`;

      const code = [
        `local __inst = (${path})`,
        `if typeof(__inst) ~= "Instance" then`,
        `  error("path did not resolve to an Instance (got " .. typeof(__inst) .. ")")`,
        `end`,
        `local __newValue = ${valueExpr}`,
        `local __old = ${readExpr}`,
        `local __ok, __err = pcall(function() ${writeStmt} end)`,
        `if not __ok then error(__err, 0) end`,
        `return string.format("OK: %s.%s changed from %s to %s", __inst:GetFullName(), ${propLiteral}, tostring(__old), tostring(${readExpr}))`,
      ].join("\n");

      return sendAndWait({
        type: "get-data-by-code",
        data: { source: sourceWithThreadContext(code, threadContext) },
        maxOutputChars,
        stampClient: true,
        truncationHint: "Pass a smaller maxOutputChars.",
        failureMessage: (response) =>
          `Failed to set property '${property}': ` + describeResponse(response),
      });
    }
  );
}
