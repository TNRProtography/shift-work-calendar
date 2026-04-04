import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const KV_NAMESPACE = 'CAL_KV';
const STORAGE_KEY_SHIFTS = 'shiftflow_entries_v1';
const STORAGE_KEY_TEMPLATES = 'shiftflow_templates_v1';

const jsonRoutePlugin = (): Plugin => {
  const createJsonHandler = async (origin: string) => {
    const [{ DEFAULT_TEMPLATES }, { ExportService }] = await Promise.all([
      import('./constants'),
      import('./services/exportService'),
    ]);

    const fetchKvValue = async (key: string) => {
      const url = new URL('/api/kv', origin);
      url.searchParams.set('namespace', KV_NAMESPACE);
      url.searchParams.set('key', key);

      const response = await fetch(url.toString());
      if (!response.ok) return null;

      const text = await response.text();
      if (!text) return null;

      try {
        const parsed = JSON.parse(text) as { value?: unknown } | unknown;
        if (parsed && typeof parsed === 'object' && 'value' in parsed) {
          return (parsed as { value?: unknown }).value;
        }

        return parsed;
      } catch {
        return null;
      }
    };

    const [rawShifts, rawTemplates] = await Promise.all([
      fetchKvValue(STORAGE_KEY_SHIFTS),
      fetchKvValue(STORAGE_KEY_TEMPLATES),
    ]);

    const shifts = Array.isArray(rawShifts) ? rawShifts : [];
    const templates = Array.isArray(rawTemplates) && rawTemplates.length > 0
      ? rawTemplates
      : DEFAULT_TEMPLATES;

    return JSON.stringify(ExportService.buildJsonExport(shifts, templates), null, 2);
  };

  const middleware = async (req: any, res: any, next: () => void) => {
    const reqPath = req.url?.split('?')[0];
    if (req.method !== 'GET' || reqPath !== '/json') {
      next();
      return;
    }

    try {
      const host = req.headers.host ?? 'localhost:3000';
      const origin = `http://${host}`;
      const payload = await createJsonHandler(origin);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ error: 'Failed to generate JSON export', message }));
    }
  };

  return {
    name: 'json-route-plugin',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), jsonRoutePlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
