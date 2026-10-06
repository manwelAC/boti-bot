import { clearStateHeader, exchangeCode, jiraConfig, readState, seal, sessionHeaders } from "@/lib/jira";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = readState(request);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const home = jiraConfig().appUrl || url.origin;
  if (!expected || !state || expected !== state || !code) {
    const reason = !expected ? "missing_state" : !code ? "missing_code" : "state_mismatch";
    return Response.redirect(`${home}/?jira_error=${reason}`, 302);
  }
  try {
    const session = await exchangeCode(code);
    const headers = new Headers({ Location: `${home}/?jira_connected=1` });
    for (const cookie of sessionHeaders(await seal(session))) headers.append("Set-Cookie", cookie);
    headers.append("Set-Cookie", clearStateHeader());
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    const safeReason = /^(token_\d{3}|resources_\d{3}|site_not_granted)$/.test(reason) ? reason : "unknown";
    console.error("Jira callback failed:", safeReason);
    return Response.redirect(`${home}/?jira_error=${safeReason}`, 302);
  }
}
