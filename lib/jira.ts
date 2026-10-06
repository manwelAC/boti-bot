import { env } from "cloudflare:workers";

type JiraSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  cloudId: string;
  siteUrl: string;
};

const sessionCookie = "boti_jira_session";
const stateCookie = "boti_jira_state";

function config() {
  const values = env as Cloudflare.Env;
  return {
    clientId: values.JIRA_CLIENT_ID || "",
    clientSecret: values.JIRA_CLIENT_SECRET || "",
    sessionKey: values.BOTI_SESSION_KEY || "",
    siteUrl: values.JIRA_SITE_URL || "",
    appUrl: values.BOTI_APP_URL || "",
  };
}

export function isConfigured() {
  const c = config();
  return Boolean(c.clientId && c.clientSecret && c.sessionKey && c.appUrl);
}

export function jiraConfig() {
  return config();
}

export function getCookie(request: Request, name: string) {
  const item = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : null;
}

function bytesToBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function cryptoKey() {
  const raw = base64UrlToBytes(config().sessionKey);
  if (raw.length !== 32) throw new Error("Invalid session key configuration");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(session: JiraSession) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(session));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), plaintext));
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(ciphertext)}`;
}

export async function unseal(value: string | null): Promise<JiraSession | null> {
  if (!value || !isConfigured()) return null;
  try {
    const [ivPart, dataPart] = value.split(".");
    if (!ivPart || !dataPart) return null;
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(ivPart) },
      await cryptoKey(),
      base64UrlToBytes(dataPart),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as JiraSession;
  } catch {
    return null;
  }
}

export function cookieHeader(name: string, value: string, maxAge: number) {
  const secure = new URL(config().appUrl).protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly${secure}; SameSite=Lax`;
}

export function sessionHeaders(value: string) {
  const parts = value.match(/.{1,3000}/g) || [];
  return [
    cookieHeader(`${sessionCookie}_parts`, String(parts.length), 60 * 60 * 24 * 30),
    ...parts.map((part, index) => cookieHeader(`${sessionCookie}_${index}`, part, 60 * 60 * 24 * 30)),
  ];
}

export function stateHeader(value: string) {
  return cookieHeader(stateCookie, value, 60 * 10);
}

export function clearStateHeader() {
  return cookieHeader(stateCookie, "", 0);
}

export function readSession(request: Request) {
  const count = Number(getCookie(request, `${sessionCookie}_parts`));
  if (Number.isInteger(count) && count > 0 && count <= 8) {
    const parts = Array.from({ length: count }, (_, index) => getCookie(request, `${sessionCookie}_${index}`));
    return unseal(parts.every(Boolean) ? parts.join("") : null);
  }
  return unseal(getCookie(request, sessionCookie));
}

export function readState(request: Request) {
  return getCookie(request, stateCookie);
}

export function makeState() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(24)));
}

export async function exchangeCode(code: string): Promise<JiraSession> {
  const c = config();
  const response = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: c.clientId,
      client_secret: c.clientSecret,
      code,
      redirect_uri: `${c.appUrl}/api/jira/callback`,
    }),
  });
  if (!response.ok) throw new Error(`token_${response.status}`);
  const token = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  const resourcesResponse = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" },
  });
  if (!resourcesResponse.ok) throw new Error(`resources_${resourcesResponse.status}`);
  const resources = await resourcesResponse.json() as { id: string; url: string; name: string }[];
  const selected = c.siteUrl
    ? resources.find((resource) => resource.url.replace(/\/$/, "") === c.siteUrl.replace(/\/$/, ""))
    : resources[0];
  if (!selected) throw new Error("site_not_granted");
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    cloudId: selected.id,
    siteUrl: selected.url,
  };
}

async function refresh(session: JiraSession): Promise<JiraSession> {
  if (!session.refreshToken) throw new Error("Jira connection expired; connect again");
  const c = config();
  const response = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: session.refreshToken,
    }),
  });
  if (!response.ok) throw new Error("Jira connection expired; connect again");
  const token = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    ...session,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || session.refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
}

export async function jiraFetch(request: Request, path: string, init?: RequestInit) {
  let session = await readSession(request);
  if (!session) throw new Error("Connect Jira first");
  let updated = false;
  if (Date.now() > session.expiresAt - 60_000) {
    session = await refresh(session);
    updated = true;
  }
  const response = await fetch(`https://api.atlassian.com/ex/jira/${encodeURIComponent(session.cloudId)}${path}`, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${session.accessToken}`, Accept: "application/json" },
    redirect: "follow",
  });
  return { response, sessionCookies: updated ? sessionHeaders(await seal(session)) : null, siteUrl: session.siteUrl };
}
