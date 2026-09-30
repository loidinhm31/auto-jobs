import type { ConfigResponse } from '../types/index.js';
import type { UseControlApiResult } from './useControlApi.js';
import type { ProjectConfigDocumentV1 } from '../../../config/config-types.js';

export type SaveConfigHttpResult =
  | { ok: true; data: ConfigResponse }
  | { ok: false; status: number; error: string; conflict?: boolean };

export async function fetchConfigDocument(
  api: UseControlApiResult,
  name: string,
): Promise<ConfigResponse> {
  const { data } = await api.requestJson<ConfigResponse>(
    `/api/config?name=${encodeURIComponent(name)}`,
  );
  return data;
}

export async function saveConfigDocument(
  api: UseControlApiResult,
  name: string,
  etag: string,
  doc: ProjectConfigDocumentV1,
): Promise<SaveConfigHttpResult> {
  const resp = await api.apiFetch(`/api/config?name=${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': etag,
    },
    body: JSON.stringify(doc),
  });

  if (resp.status === 409 || resp.status === 412) {
    return { ok: false, status: resp.status, error: 'Conflict: Config was modified elsewhere. Please reload.', conflict: true };
  }

  if (!resp.ok) {
    let errText = `HTTP ${resp.status}`;
    try {
      const errJson = (await resp.json()) as { error?: { message?: string } };
      if (errJson?.error?.message) errText = errJson.error.message;
    } catch {
      // Ignore json parse error on response
    }
    return { ok: false, status: resp.status, error: `Save failed: ${errText}` };
  }

  const data = (await resp.json()) as ConfigResponse;
  return { ok: true, data };
}
