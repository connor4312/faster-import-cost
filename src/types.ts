import { SourceLocation } from "estree";

export type ImportMembers = "all" | "default" | string[];

export interface IImport {
  range: SourceLocation;
  name: string;
  members: ImportMembers;
}

export interface ICachedRecord {
  lastUsed: Date;
  original: number;
  compressed: number;
}

export const enum Target {
  nodeJS,
  browser,
}
