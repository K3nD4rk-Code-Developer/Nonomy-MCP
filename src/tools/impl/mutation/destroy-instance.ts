import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { describeResponse, sendAndWait, sourceWithThreadContext } from "../../factory.js";
import { maxOutputCharsSchema, threadContextSchema } from "../../schemas.js";

export default function register(server: McpServer): void {
  server.registerTool(
    "destroy-instance",
    {
      title: "Destroy instance",
      description:
        "Destroy a Roblox Instance (and its descendants). This is irreversible — verify the target path with search-instances or get-descendants-tree first, and pass confirm=true to actually perform the destroy.",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            "Lua expression that resolves to the target Instance, e.g. 'game.Workspace.LeftoverFolder'."
          ),
        confirm: z
          .boolean()
          .describe("Must be explicitly set to true to perform the destroy; defaults to false as a safety guard.")
          .optional()
          .default(false),
        threadContext: threadContextSchema,
        maxOutputChars: maxOutputCharsSchema,
      }),
    },
    async ({ path, confirm, threadContext, maxOutputChars }) => {
      if (!confirm) {
        return {
          content: [
            {
              type: "text",
              text: `Not destroyed: pass confirm=true to actually destroy '${path}'. This action is irreversible.`,
            },
          ],
          isError: true,
        };
      }

      const code = [
        `local __inst = (${path})`,
        `if typeof(__inst) ~= "Instance" then`,
        `  error("path did not resolve to an Instance (got " .. typeof(__inst) .. ")")`,
        `end`,
        `local __name = __inst:GetFullName()`,
        `local __class = __inst.ClassName`,
        `__inst:Destroy()`,
        `return string.format("Destroyed %s (%s)", __name, __class)`,
      ].join("\n");

      return sendAndWait({
        type: "get-data-by-code",
        data: { source: sourceWithThreadContext(code, threadContext) },
        maxOutputChars,
        stampClient: true,
        truncationHint: "Pass a smaller maxOutputChars.",
        failureMessage: (response) => `Failed to destroy instance: ` + describeResponse(response),
      });
    }
  );
}
