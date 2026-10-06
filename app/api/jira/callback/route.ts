import { clearStateHeader, exchangeCode, jiraConfig, readState, seal, sessionHeader } from "@/lib/jira";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = readState(request);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const home = jiraConfig().appUrl || url.origin;
  if (!expected || !state || expected !== state || !code) {
    return Response.redirect(`${home}/?jira_error=authorization`, 302);
  }
  try {
    const session = await exchangeCode(code);
    const response = Response.redirect(`${home}/`, 302);
    response.headers.append("Set-Cookie", sessionHeader(await seal(session)));
    response.headers.append("Set-Cookie", clearStateHeader());
    return response;
  } catch {
    return Response.redirect(`${home}/?jira_error=connection`, 302);
  }
}
