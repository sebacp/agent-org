export interface FileMeta {
  id: string;
  title: string;
  /** Role of the agent that wrote it, so the library reads like a company's. */
  author: string;
  area: string;
  tags: string[];
  chars: number;
  createdAt: string;
}

export interface FileRecord extends FileMeta {
  content: string;
}

export interface FileFilter {
  query?: string;
  area?: string;
  tag?: string;
  author?: string;
  limit?: number;
}
