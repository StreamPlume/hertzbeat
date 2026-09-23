/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { ApiMessageError } from '@/core/http/api-message';

import {
  ExploreSignalContractError,
  ExploreSignalMissingError,
  ExploreSignalUnavailableError
} from '../model/explore-signal-contract';

export function classifyExploreSignalError(
  reason: unknown
): 'missing' | 'permission' | 'transport_error' | 'contract_error' | 'error' {
  if (reason instanceof ExploreSignalMissingError) return 'missing';
  if (reason instanceof ExploreSignalUnavailableError) return 'transport_error';
  if (reason instanceof ExploreSignalContractError) return 'contract_error';
  return reason instanceof ApiMessageError ? classifyApiMessageError(reason) : 'error';
}

function classifyApiMessageError(reason: ApiMessageError) {
  if (reason.status === 404 || (reason.status === 200 && reason.code === 3)) return 'missing';
  if (reason.status === 401 || reason.status === 403) return 'permission';
  if (reason.cause !== undefined || reason.status === undefined || [0, 502, 503, 504].includes(reason.status)) {
    return 'transport_error';
  }
  return 'error';
}
