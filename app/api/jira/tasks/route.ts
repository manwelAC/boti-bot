import { jiraFetch } from "@/lib/jira";

export async function GET(request: Request) {
  try {
    const jql = "assignee = currentUser() ORDER BY updated DESC";
    const { response, sessionCookies } = await jiraFetch(request, "/rest/api/3/search/jql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jql, maxResults: 50, fields: ["summary", "status", "issuetype", "updated", "attachment"] }),
    });
    if (!response.ok) return Response.json({ error: `Jira returned ${response.status}` }, { status: 502 });
    const payload = await response.json() as { issues?: { key: string; fields?: { summary?: string; updated?: string; status?: { name?: string }; issuetype?: { name?: string }; attachment?: unknown[] } }[] };
    const result = Response.json({ tasks: (payload.issues || []).map((issue) => ({
      key: issue.key,
      title: issue.fields?.summary || "Untitled task",
      status: issue.fields?.status?.name || "Unknown",
      type: issue.fields?.issuetype?.name || "Task",
      updated: issue.fields?.updated || "",
      attachments: Array.isArray(issue.fields?.attachment) ? issue.fields?.attachment.length : 0,
    })) });
    for (const cookie of sessionCookies || []) result.headers.append("Set-Cookie", cookie);
    return result;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load assigned tasks" }, { status: 401 });
  }
}
