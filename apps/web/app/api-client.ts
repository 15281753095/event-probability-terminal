import type { ApiErrorResponse } from "@ept/shared-types";

export async function apiErrorMessage(response: Response): Promise<string> {
  const payload = await readApiError(response);
  if (payload) {
    return `${payload.error}: ${payload.message}`;
  }
  return `API returned HTTP ${response.status}.`;
}

async function readApiError(response: Response): Promise<ApiErrorResponse | undefined> {
  try {
    const payload = (await response.clone().json()) as Partial<ApiErrorResponse>;
    if (
      typeof payload.contractVersion === "string" &&
      typeof payload.status === "string" &&
      typeof payload.error === "string" &&
      typeof payload.message === "string" &&
      typeof payload.generatedAt === "string"
    ) {
      return payload as ApiErrorResponse;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
