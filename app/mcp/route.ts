type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

const protocolVersion = "2025-06-18";

function result(id: JsonRpcRequest["id"], value: unknown) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result: value });
}

function error(id: JsonRpcRequest["id"], code: number, message: string) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status: code === -32001 ? 401 : 400 });
}

const tools = [
  {
    name: "get_task_context",
    description: "Return the task context available in Boti-bot. Use this before reading Jira source documents.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_attachment_text",
    description: "Prepare an attachment for document reading. Returns the attachment reference and extraction status; the PDF text extraction bridge is the next step.",
    inputSchema: { type: "object", properties: { attachment_id: { type: "string" } }, required: ["attachment_id"], additionalProperties: false },
  },
];

export async function POST(request: Request) {
  const body = await request.json() as JsonRpcRequest;
  const id = body.id;
  const method = body.method;
  const userId = request.headers.get("oai-authenticated-user-id");

  if (method === "initialize") {
    return result(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "boti-bot", version: "0.1.0" } });
  }
  if (method === "notifications/initialized") return new Response(null, { status: 204 });
  if (method === "tools/list") return result(id, { tools });
  if (method === "tools/call") {
    if (!userId) return error(id, -32001, "Authentication required");
    const params = body.params || {};
    const name = String(params.name || "");
    if (name === "get_task_context") {
      return result(id, { content: [{ type: "text", text: "Boti-bot is connected. Jira source documents are available through the task workspace. Ask for a specific Jira issue key or attachment to continue reading." }] });
    }
    if (name === "get_attachment_text") {
      const args = (params.arguments || {}) as Record<string, unknown>;
      const attachmentId = String(args.attachment_id || "");
      if (!/^\d+$/.test(attachmentId)) return error(id, -32602, "attachment_id must be a Jira attachment ID");
      return result(id, { content: [{ type: "text", text: `Attachment ${attachmentId} is available in Boti-bot. PDF text extraction will be returned here once the Jira document bridge is enabled.` }] });
    }
    return error(id, -32601, `Unknown tool: ${name}`);
  }
  return error(id, -32601, `Unknown method: ${method || ""}`);
}
