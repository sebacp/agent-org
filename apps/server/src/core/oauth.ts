import { randomUUID } from "node:crypto";
import {
  auth,
  type OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { IncomingMessage } from "node:http";
import { isSafeId } from "@agent-org/shared/id";
import type { OAuthSession, SourceDef } from "@agent-org/shared/source-types";
import { patchOAuth, readSource } from "./sources";

/** Ties one callback back to the source that started it. */
const SEPARATOR = "~";

/**
 * A local install has no fixed hostname, so the address the browser will come
 * back to is taken from whichever request opened the flow.
 */
let origin = process.env.APP_ORIGIN ?? "http://localhost:3100";

export function rememberOrigin(req: IncomingMessage): void {
  if (process.env.APP_ORIGIN) return;
  // The browser talks to the web app, which hands the request over to us on
  // another port: `host` by then says the port nobody can come back to.
  const forwardedHost = req.headers["x-forwarded-host"];
  const host =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)?.split(
      ",",
    )[0] ?? req.headers.host;
  // Only ever used to build our own redirect URL, and a host that isn't a plain
  // `name:port` has no business becoming one.
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return;
  const forwarded = req.headers["x-forwarded-proto"];
  const proto =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0] ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  origin = `${proto}://${host}`;
}

export function callbackUrl(): string {
  return `${origin}/api/sources/oauth`;
}

export function parseState(
  value: string,
): { orgId: string; sourceId: string } | null {
  const [orgId, sourceId] = value.split(SEPARATOR);
  if (!orgId || !sourceId || !isSafeId(orgId) || !isSafeId(sourceId)) {
    return null;
  }
  return { orgId, sourceId };
}

/**
 * Reads and writes one source's OAuth session for the SDK, which drives the
 * whole flow: discovery, registration, PKCE and refreshing.
 */
class SourceAuthProvider implements OAuthClientProvider {
  /** Where the SDK wanted to send the browser, since a server can't go there. */
  authUrl?: string;

  constructor(
    private readonly orgId: string,
    private readonly sourceId: string,
  ) {}

  get redirectUrl(): string {
    return callbackUrl();
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "agent-org",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  private async session(): Promise<OAuthSession> {
    return (await readSource(this.orgId, this.sourceId))?.oauth ?? {};
  }

  async state(): Promise<string> {
    const value = [this.orgId, this.sourceId, randomUUID()].join(SEPARATOR);
    await patchOAuth(this.orgId, this.sourceId, { state: value });
    return value;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const { clientId, clientSecret } = await this.session();
    return clientId
      ? { client_id: clientId, client_secret: clientSecret }
      : undefined;
  }

  async saveClientInformation(
    information: OAuthClientInformationMixed,
  ): Promise<void> {
    await patchOAuth(this.orgId, this.sourceId, {
      clientId: information.client_id,
      clientSecret: information.client_secret,
      manual: false,
    });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return (await this.session()).tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await patchOAuth(this.orgId, this.sourceId, { tokens });
  }

  redirectToAuthorization(url: URL): void {
    this.authUrl = url.toString();
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    await patchOAuth(this.orgId, this.sourceId, { codeVerifier: verifier });
  }

  async codeVerifier(): Promise<string> {
    const { codeVerifier } = await this.session();
    if (!codeVerifier) throw new Error("Se perdió el permiso a medio camino.");
    return codeVerifier;
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ): Promise<void> {
    // A hand-typed client id was somebody's work, so only a registered one is
    // thrown away and registered again.
    const drop =
      scope === "client" || scope === "all"
        ? (await this.session()).manual
          ? {}
          : { clientId: undefined, clientSecret: undefined }
        : {};
    await patchOAuth(this.orgId, this.sourceId, {
      ...drop,
      ...(scope === "tokens" || scope === "all" ? { tokens: undefined } : {}),
      ...(scope === "verifier" || scope === "all"
        ? { codeVerifier: undefined }
        : {}),
    });
  }
}

export function providerFor(
  orgId: string,
  sourceId: string,
): OAuthClientProvider {
  return new SourceAuthProvider(orgId, sourceId);
}

/**
 * Moves the flow forward one step. Returns the address the person has to open,
 * or an empty string once the source is authorized and can just be used.
 */
export async function authorize(
  orgId: string,
  source: SourceDef,
  code?: string,
): Promise<string> {
  if (!source.url) throw new Error("La fuente no tiene URL.");
  const provider = new SourceAuthProvider(orgId, source.id);
  const result = await auth(provider, {
    serverUrl: source.url,
    authorizationCode: code,
  });
  if (result === "AUTHORIZED") return "";
  if (!provider.authUrl)
    throw new Error("El servidor no ofreció dónde entrar.");
  return provider.authUrl;
}
