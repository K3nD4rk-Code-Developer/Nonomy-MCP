import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { describeResponse, sendAndWait, sourceWithThreadContext } from "../../factory.js";
import { maxOutputCharsSchema, threadContextSchema } from "../../schemas.js";
import { jsValueToLuaLiteral, luaStringLiteral, type SimpleValue } from "./lua-literals.js";

const simpleValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export default function register(server: McpServer): void {
  server.registerTool(
    "create-instance",
    {
      title: "Create instance",
      description:
        "Create a new Roblox Instance and parent it under an existing Instance. Use 'properties' for plain string/number/boolean/null property values, or 'propertiesCode' (a Lua expression returning a table) for Roblox-specific types such as Vector3, CFrame, Color3, or Enum members. This mutates live game state — verify the target parent first with search-instances or get-descendants-tree.",
      inputSchema: z.object({
        className: z.string().describe("The Instance class to create, e.g. 'Part', 'Folder', 'RemoteEvent'."),
        parent: z
          .string()
          .describe(
            "Lua expression that resolves to the parent Instance, e.g. 'game.Workspace' or 'game:GetService(\"ReplicatedStorage\")'."
          ),
        name: z.string().describe("Name to give the new instance (default: the class's default Name).").optional(),
        properties: z
          .record(z.string(), simpleValueSchema)
          .describe("Plain string/number/boolean/null properties to set, e.g. { Anchored: true, Transparency: 0.5 }.")
          .optional(),
        propertiesCode: z
          .string()
          .describe(
            "Lua expression evaluating to a table of properties to apply, e.g. '{ Size = Vector3.new(4, 1, 8), CFrame = CFrame.new(0, 10, 0) }'. Applied after 'properties', so it can override them."
          )
          .optional(),
        threadContext: threadContextSchema,
        maxOutputChars: maxOutputCharsSchema,
      }),
    },
    async ({ className, parent, name, properties, propertiesCode, threadContext, maxOutputChars }) => {
      let assignLines: string[];
      try {
        assignLines = Object.entries(properties ?? {}).map(
          ([key, value]) => `__inst[${luaStringLiteral(key)}] = ${jsValueToLuaLiteral(value as SimpleValue)}`
        );
      } catch (err) {
        return {
          content: [{ type: "text", text: `Invalid property value: ${(err as Error).message}` }],
          isError: true,
        };
      }

      const lines = [
        `local __parent = (${parent})`,
        `if typeof(__parent) ~= "Instance" then`,
        `  error("parent did not resolve to an Instance (got " .. typeof(__parent) .. ")")`,
        `end`,
        `local __inst = Instance.new(${luaStringLiteral(className)})`,
        ...(name !== undefined ? [`__inst.Name = ${luaStringLiteral(name)}`] : []),
        ...assignLines,
        ...(propertiesCode !== undefined
          ? [
              `for __k, __v in pairs(${propertiesCode}) do`,
              `  __inst[__k] = __v`,
              `end`,
            ]
          : []),
        `__inst.Parent = __parent`,
        `return string.format("Created %s (%s) at %s", __inst.Name, __inst.ClassName, __inst:GetFullName())`,
      ];

      return sendAndWait({
        type: "get-data-by-code",
        data: { source: sourceWithThreadContext(lines.join("\n"), threadContext) },
        maxOutputChars,
        stampClient: true,
        truncationHint: "Pass a smaller maxOutputChars.",
        failureMessage: (response) =>
          `Failed to create instance '${className}': ` + describeResponse(response),
      });
    }
  );
}
