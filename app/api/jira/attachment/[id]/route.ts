import { jiraFetch } from "@/lib/jira";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return new Response("Invalid attachment", { status: 400 });
  try {
    const { response, sessionCookie } = await jiraFetch(request, `/rest/api/3/attachment/content/${id}?redirect=false`);
    if (!response.ok) return new Response("Attachment unavailable", { status: response.status === 404 ? 404 : 502 });
    const result = new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
    if (sessionCookie) result.headers.append("Set-Cookie", sessionCookie);
    return result;
  } catch {
    return new Response("Connect Jira first", { status: 401 });
  }
}
