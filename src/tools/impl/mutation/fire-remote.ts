import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { describeResponse, sendAndWait, sourceWithThreadContext } from "../../factory.js";
import { maxOutputCharsSchema, threadContextSchema } from "../../schemas.js";
import { jsValueToLuaLiteral, type SimpleValue } from "./lua-literals.js";

const simpleValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export default function register(server: McpServer): void {
  server.registerTool(
    "fire-remote",
    {
      title: "Fire a RemoteEvent or invoke a RemoteFunction",
      description:
        "Call a RemoteEvent (FireServer) or RemoteFunction (InvokeServer, returning the server's reply) from the active client. Useful for testing remote validation and replaying calls seen in remote-spy. This has real server-side side effects and cannot be undone — use remote-spy first to find the target remote and its expected argument shape, then pass confirm=true to actually fire.",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            "Lua expression that resolves to the RemoteEvent/RemoteFunction, e.g. 'game:GetService(\"ReplicatedStorage\").Remotes.BuyItem'."
          ),
        args: z
          .array(simpleValueSchema)
          .describe("Plain string/number/boolean/null arguments to pass, in order, e.g. [1, \"sword\", true].")
          .optional()
          .default([]),
        argsCode: z
          .string()
          .describe(
            "Lua expression list producing the arguments, e.g. 'Vector3.new(0, 10, 0), Enum.Material.Neon'. Takes precedence over 'args' when given."
          )
          .optional(),
        confirm: z
          .boolean()
          .describe("Must be explicitly set to true to actually fire the remote; defaults to false as a safety guard.")
          .optional()
          .default(false),
        threadContext: threadContextSchema,
        timeout: z
          .number()
          .describe("Timeout in milliseconds for the response (default: 15000, max: 120000).")
          .optional()
          .default(15000),
        maxOutputChars: maxOutputCharsSchema,
      }),
    },
    async ({ path, args, argsCode, confirm, threadContext, timeout, maxOutputChars }) => {
      if (!confirm) {
        return {
          content: [
            {
              type: "text",
              text: `Not fired: pass confirm=true to actually fire '${path}'. This has real server-side side effects.`,
            },
          ],
          isError: true,
        };
      }

      let argsExpr: string;
      try {
        argsExpr = argsCode !== undefined ? argsCode : args.map((v) => jsValueToLuaLiteral(v as SimpleValue)).join(", ");
      } catch (err) {
        return {
          content: [{ type: "text", text: `Invalid argument value: ${(err as Error).message}` }],
          isError: true,
        };
      }

      const code = [
        `local __remote = (${path})`,
        `if typeof(__remote) ~= "Instance" then`,
        `  error("path did not resolve to an Instance (got " .. typeof(__remote) .. ")")`,
        `end`,
        `if __remote:IsA("RemoteFunction") then`,
        `  local __results = table.pack(pcall(function() return __remote:InvokeServer(${argsExpr}) end))`,
        `  if not __results[1] then error(__results[2], 0) end`,
        `  return table.unpack(__results, 2, __results.n)`,
        `elseif __remote:IsA("RemoteEvent") or __remote:IsA("UnreliableRemoteEvent") then`,
        `  __remote:FireServer(${argsExpr})`,
        `  return "Fired " .. __remote:GetFullName()`,
        `else`,
        `  error("path does not resolve to a RemoteEvent/RemoteFunction (got " .. __remote.ClassName .. ")")`,
        `end`,
      ].join("\n");

      const clampedTimeout = Math.min(Math.max(timeout, 1000), 120000);

      return sendAndWait({
        type: "get-data-by-code",
        data: { source: sourceWithThreadContext(code, threadContext) },
        timeoutMs: clampedTimeout,
        maxOutputChars,
        stampClient: true,
        truncationHint: "Pass a smaller maxOutputChars.",
        failureMessage: (response) => `Failed to fire remote: ` + describeResponse(response),
      });
    }
  );
}
