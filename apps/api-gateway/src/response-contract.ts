import {
  API_CONTRACT_VERSION,
  type ApiErrorCode,
  type ApiErrorResponse,
  type ApiResponseKind,
  type ApiResponseMeta,
  type ApiResponseStatus,
  type SourceProvenance
} from "@ept/shared-types";

export function okMeta<K extends ApiResponseKind>(input: {
  responseKind: K;
  generatedAt: string;
  sourceMode: SourceProvenance["sourceMode"];
  message: string;
}): ApiResponseMeta & { responseKind: K } {
  return {
    contractVersion: API_CONTRACT_VERSION,
    responseKind: input.responseKind,
    generatedAt: input.generatedAt,
    status: "ok",
    source: "polymarket",
    mode: input.sourceMode,
    isFixtureBacked: input.sourceMode === "fixture",
    isReadOnly: true,
    isPlaceholderPricing: true,
    message: input.message
  };
}

export function apiError(input: {
  status: Exclude<ApiResponseStatus, "ok">;
  error: ApiErrorCode;
  message: string;
  generatedAt: string;
  supportedIds?: string[];
}): ApiErrorResponse {
  return {
    contractVersion: API_CONTRACT_VERSION,
    status: input.status,
    error: input.error,
    message: input.message,
    generatedAt: input.generatedAt,
    ...(input.supportedIds ? { supportedIds: input.supportedIds } : {})
  };
}
