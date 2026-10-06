import { isConfigured, jiraConfig, makeState, stateHeader } from "@/lib/jira";

export async function GET() {
  if (!isConfigured()) return Response.json({ error: "Jira connection has not been configured yet" }, { status: 503 });
  const c = jiraConfig();
  const state = makeState();
  const url = new URL("https://auth.atlassian.com/authorize");
  url.searchParams.set("audience", "api.atlassian.com");
  url.searchParams.set("client_id", c.clientId);
  url.searchParams.set("scope", "read:jira-work offline_access");
  url.searchParams.set("redirect_uri", `${c.appUrl}/api/jira/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("prompt", "consent");
  const response = Response.redirect(url.toString(), 302);
  response.headers.append("Set-Cookie", stateHeader(state));
  return response;
}
