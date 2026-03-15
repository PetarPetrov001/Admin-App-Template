export interface ProgressEntry {
  resourceId: string;
  locale: string;
  key: string;
  digest: string;
  valueHash: string;
  translatedAt: string;
  status: "success" | "failed";
  error?: string;
}

export interface ProgressFile {
  version: 1;
  entries: ProgressEntry[];
}
