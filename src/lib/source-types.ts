export type SourceTransport = "http" | "stdio";

export interface SourceDef {
  id: string;
  label: string;
  transport: SourceTransport;
  /** `http`: the MCP endpoint. */
  url: string;
  /** `http`: sent as a bearer header. Stays on the server. */
  token: string;
  /** `stdio`: the executable and its arguments, as typed on one line. */
  command: string;
  /** Areas allowed to use it. Empty means the whole company. */
  departments: string[];
  /** Drops the tools the server itself declares as writing. */
  readOnly: boolean;
  enabled: boolean;
}

/** What the browser sees: the same thing without the secret. */
export type SourceView = Omit<SourceDef, "token"> & { hasToken: boolean };

/** The result of actually connecting, which is the only real test. */
export interface SourceProbe {
  tools: string[];
  error?: string;
}

export const SOURCE_PREFIX = "fuente__";
