import { isConfigured, readSession } from "@/lib/jira";

export async function GET(request: Request) {
  const session = await readSession(request);
  return Response.json({ configured: isConfigured(), connected: Boolean(session), siteUrl: session?.siteUrl || null });
}
