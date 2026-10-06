declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    JIRA_CLIENT_ID?: string;
    JIRA_CLIENT_SECRET?: string;
    JIRA_SITE_URL?: string;
    BOTI_APP_URL?: string;
    BOTI_SESSION_KEY?: string;
  }
}
