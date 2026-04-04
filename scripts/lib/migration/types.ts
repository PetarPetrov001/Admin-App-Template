export interface ThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

export interface CostExtensions {
  requestedQueryCost: number;
  actualQueryCost: number;
  throttleStatus: ThrottleStatus;
}

/** Base constraint for any progress entry — must have a status field. */
export interface ProgressEntryBase {
  status: 'success' | 'failed';
  error?: string;
}

/** Generic progress file. The entry type is determined by the caller. */
export interface ProgressFile<E extends ProgressEntryBase = ProgressEntryBase> {
  version: 1;
  entries: E[];
}

/** Translation progress entry — keyed by a composite of resource/locale/key/digest/hash. */
export interface TranslationProgressEntry extends ProgressEntryBase {
  resourceId: string;
  locale: string;
  key: string;
  digest: string;
  valueHash: string;
  translatedAt: string;
}
