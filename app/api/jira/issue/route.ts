import { jiraFetch } from "@/lib/jira";

const keyPattern = /^[A-Za-z][A-Za-z0-9]+-\d+$/;

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key")?.trim().toUpperCase() || "";
  if (!keyPattern.test(key)) return Response.json({ error: "Enter a Jira task key such as SM360-1551" }, { status: 400 });
  try {
    const { response, sessionCookies, siteUrl } = await jiraFetch(
      request,
      `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,attachment,status,issuetype`,
    );
    if (!response.ok) {
      const error = response.status === 404 ? "Task not found or you do not have access" : `Jira returned ${response.status}`;
      return Response.json({ error }, { status: response.status === 404 ? 404 : 502 });
    }
    const issue = await response.json() as {
      key: string;
      fields: {
        summary?: string;
        description?: unknown;
        status?: { name?: string };
        issuetype?: { name?: string };
        attachment?: { id: string; filename: string; mimeType: string; size: number; created: string }[];
      };
    };
    const result = Response.json({
      key: issue.key,
      title: issue.fields.summary || "Untitled task",
      description: issue.fields.description || null,
      status: issue.fields.status?.name || "",
      type: issue.fields.issuetype?.name || "",
      attachments: (issue.fields.attachment || []).map(({ id, filename, mimeType, size, created }) => ({ id, filename, mimeType, size, created })),
      jiraUrl: `${siteUrl}/browse/${encodeURIComponent(issue.key)}`,
    });
    for (const cookie of sessionCookies || []) result.headers.append("Set-Cookie", cookie);
    return result;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load task" }, { status: 401 });
  }
}
