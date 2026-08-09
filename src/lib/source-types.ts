import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

export type SourceTransport = "http" | "stdio";

/** How the server is told who is calling. */
export type SourceAuth = "none" | "token" | "oauth";

/** One function the MCP server exposes, as the last connection saw it. */
export interface SourceTool {
  name: string;
  description: string;
  /** The server declares it doesn't write anything. */
  readOnly: boolean;
}

/** Everything the OAuth flow needs to remember between requests. */
export interface OAuthSession {
  /**
   * Registered on first use where the service allows it. GitHub, Slack and
   * HubSpot don't, so there the person pastes one they made by hand.
   */
  clientId?: string;
  clientSecret?: string;
  /** A hand-typed client survives a re-registration; a discovered one doesn't. */
  manual?: boolean;
  tokens?: OAuthTokens;
  /** Both are only alive between the redirect and the callback that answers it. */
  codeVerifier?: string;
  state?: string;
}

export interface SourceDef {
  id: string;
  label: string;
  transport: SourceTransport;
  /** `http`: the MCP endpoint. */
  url: string;
  auth: SourceAuth;
  /** `token`: sent as a bearer header. Stays on the server. */
  token: string;
  /** `oauth`: the session, refreshed as it expires. Stays on the server. */
  oauth?: OAuthSession;
  /** `stdio`: the executable and its arguments, as typed on one line. */
  command: string;
  enabled: boolean;
  /**
   * What the last connection found. Cached because the agent sheet has to list
   * the tools to pick from, and the browser can't reach the server itself.
   */
  tools: SourceTool[];
}

/** What the browser sees: the same thing without either secret. */
export type SourceView = Omit<SourceDef, "token" | "oauth"> & {
  hasToken: boolean;
  /** `oauth`: somebody signed in and the session is still stored. */
  connected: boolean;
  /** `oauth`: the client id was typed rather than registered automatically. */
  clientId: string;
};

/** A half-filled source on its way to the server. */
export type SourceDraft = Partial<SourceView> & {
  token?: string;
  clientSecret?: string;
};

/**
 * What one agent may reach. Access is granted tool by tool rather than per
 * source, so a function the server adds later stays off until somebody says
 * otherwise.
 */
export interface SourceGrant {
  sourceId: string;
  tools: string[];
}

/** A granted source, narrowed to the tools that one agent may call. */
export interface AllowedSource extends SourceDef {
  allowed: string[];
}

/** The result of actually connecting, which is the only real test. */
export interface SourceProbe {
  tools: SourceTool[];
  error?: string;
  /** An OAuth source can't answer anything until somebody opens this and signs in. */
  authUrl?: string;
}

export const SOURCE_PREFIX = "fuente__";
