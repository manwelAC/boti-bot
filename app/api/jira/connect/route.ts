import { isConfigured, jiraConfig, makeState, stateHeader } from "@/lib/jira";

export async function GET(request: Request) {
  if (!isConfigured()) return Response.json({ error: "Jira connection has not been configured yet" }, { status: 503 });
  const c = jiraConfig();
  const canonical = new URL(c.appUrl);
  if (new URL(request.url).origin !== canonical.origin) {
    return Response.redirect(new URL("/api/jira/connect", canonical), 302);
  }
  const state = makeState();
  const url = new URL("https://auth.atlassian.com/authorize");
  url.searchParams.set("audience", "api.atlassian.com");
  url.searchParams.set("client_id", c.clientId);
  url.searchParams.set("scope", "read:jira-work offline_access");
  url.searchParams.set("redirect_uri", `${c.appUrl}/api/jira/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("prompt", "consent");
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      "Set-Cookie": stateHeader(state),
    },
  });
}
