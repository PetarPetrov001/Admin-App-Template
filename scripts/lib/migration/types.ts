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

export interface MutationResult<T> {
  node: T;
  status: 'success' | 'failed';
  error?: string;
  throttle?: ThrottleStatus;
  cost?: number;
}

/** Base constraint for any progress entry — must have a status field. */
export interface ProgressEntryBase {
  status: 'success' | 'failed';
  error?: string;
}

/** Simple progress entry for batch mutations — keyed by a single ID. */
export interface BatchProgressEntry extends ProgressEntryBase {
  id: string;
  processedAt: string;
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
