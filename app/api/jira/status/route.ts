import { getCookie, isConfigured, readSession } from "@/lib/jira";

export async function GET(request: Request) {
  const session = await readSession(request);
  const expectedParts = Number(getCookie(request, "boti_jira_session_parts")) || 0;
  const receivedParts = Array.from({ length: Math.min(expectedParts, 8) }, (_, index) =>
    getCookie(request, `boti_jira_session_${index}`),
  ).filter(Boolean).length;
  return Response.json({
    configured: isConfigured(),
    connected: Boolean(session),
    siteUrl: session?.siteUrl || null,
    sessionCheck: session ? "ok" : expectedParts === 0 ? "cookie_missing" : receivedParts < expectedParts ? "cookie_incomplete" : "cookie_invalid",
  });
}
