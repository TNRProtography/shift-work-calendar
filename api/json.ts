import { DEFAULT_TEMPLATES } from '../constants';
import { ExportService } from '../services/exportService';
import type { ShiftEntry, ShiftTemplate } from '../types';

const KV_NAMESPACE = 'CAL_KV';
const STORAGE_KEY_SHIFTS = 'shiftflow_entries_v1';
const STORAGE_KEY_TEMPLATES = 'shiftflow_templates_v1';

type KvResponse = {
  value?: unknown;
};

const buildKvUrl = (request: Request, key: string) => {
  const url = new URL(request.url);
  url.pathname = '/api/kv';
  url.search = `namespace=${encodeURIComponent(KV_NAMESPACE)}&key=${encodeURIComponent(key)}`;
  return url.toString();
};

const fetchKvValue = async (request: Request, key: string) => {
  const response = await fetch(buildKvUrl(request, key));
  if (!response.ok) return null;

  const text = await response.text();
  if (!text) return null;

  const parsed = JSON.parse(text) as KvResponse | unknown;
  if (parsed && typeof parsed === 'object' && 'value' in parsed) {
    return (parsed as KvResponse).value;
  }

  return parsed;
};

const toTemplates = (input: unknown): ShiftTemplate[] => {
  if (!Array.isArray(input) || input.length === 0) {
    return DEFAULT_TEMPLATES;
  }

  return input as ShiftTemplate[];
};

const toShifts = (input: unknown): ShiftEntry[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  return input as ShiftEntry[];
};

export default async function handler(request: Request): Promise<Response> {
  try {
    const [rawShifts, rawTemplates] = await Promise.all([
      fetchKvValue(request, STORAGE_KEY_SHIFTS),
      fetchKvValue(request, STORAGE_KEY_TEMPLATES),
    ]);

    const payload = ExportService.buildJsonExport(toShifts(rawShifts), toTemplates(rawTemplates));

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: 'Failed to generate JSON export', message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
}
