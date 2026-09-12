import { appConfig } from '../lib/config';
import { ApiRepository } from './api-repository';
import { MockRepository } from './mock-repository';
import type { IncidentRepository } from './repository';

let instance: IncidentRepository | null = null;

/** The single repository the whole app uses. */
export function getRepository(): IncidentRepository {
  instance ??= appConfig.dataMode === 'api' ? new ApiRepository() : new MockRepository();
  return instance;
}

/** Test seam. */
export function setRepository(repository: IncidentRepository | null): void {
  instance = repository;
}

export type { IncidentRepository, AppMeta, ScanStatus, ScanStartResult } from './repository';
export { ApiError } from './api-repository';
