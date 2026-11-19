import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import type { FunctionDeclaration } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const placementToolDeclarations: FunctionDeclaration[] = [
  {
    name: 'getApplications',
    description:
      'Retrieve all saved job applications from the user IndexedDB vault, optionally filtered by status or company name.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        status: {
          type: Type.STRING,
          description:
            'Optional status filter: Applied, In Progress, Interviewing, Offer, Rejected, or Withdrawn.',
        },
        query: {
          type: Type.STRING,
          description: 'Optional case-insensitive substring to match company name or role.',
        },
      },
    },
  },
  {
    name: 'getUpcomingEvents',
    description:
      'Retrieve upcoming recruitment rounds (assessments, coding tests, interviews, expected results) sorted chronologically with hours remaining and urgency level.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        withinDays: {
          type: Type.NUMBER,
          description: 'Optional number of days ahead to include. Omit to return all upcoming events.',
        },
      },
    },
  },
  {
    name: 'updateApplication',
    description:
      'Propose an update to an existing application record (status, notes, or package). Changes always require explicit user confirmation in the UI before being written to IndexedDB.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        applicationId: {
          type: Type.STRING,
          description: 'Exact ID of the application returned by getApplications().',
        },
        status: {
          type: Type.STRING,
          description:
            'Optional new status: Applied, In Progress, Interviewing, Offer, Rejected, or Withdrawn.',
        },
        notes: {
          type: Type.STRING,
          description: 'Optional updated notes text for the application.',
        },
        package: {
          type: Type.STRING,
          description: 'Optional updated compensation/package string.',
        },
        reason: {
          type: Type.STRING,
          description: 'Short explanation of why this update is recommended for the user to confirm.',
        },
      },
      required: ['applicationId', 'reason'],
    },
  },
];

function buildSystemInstruction(todayIso: string): string {
  return [
    'You are CareerVault AI, a concise, practical personal placement assistant.',
    `Current local date/time ISO: ${todayIso}.`,
    'CRITICAL RULES:',
    '1. Always call getApplications() and getUpcomingEvents() first to read the user’s real saved records before giving any analysis.',
    '2. NEVER invent, fabricate, or assume any company names, dates, rounds, offers, or statuses that are not explicitly returned by the tools.',
    '3. If the user has no applications saved, say so clearly and suggest adding their first application.',
    '4. Highlight events within 24 hours as top urgent priority first (e.g., "Your HPE assessment is tomorrow. Prioritize preparation today."). Then highlight events within 3 days, pending results to follow up on, and overall placement progress.',
    '5. Only call updateApplication() when the user asks to update a record or when an application status clearly needs syncing; remember updates are strictly confirmation-gated by the user.',
    '6. Format your final response cleanly in short paragraphs and concise bullet points (plain markdown with **bold** highlights and `- ` bullets). Keep it clear, encouraging, and directly actionable (under 260 words).',
  ].join('\n');
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const geminiConfigured = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
    res.json({ ok: true, geminiConfigured });
  });

  app.post('/api/gemini/analyze', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        ok: false,
        available: false,
        error: 'Gemini API key is not configured on the server. Using Demo Mode.',
      });
      return;
    }

    const body = req.body as {
      contents?: unknown[];
      todayIso?: string;
    };

    if (!Array.isArray(body?.contents) || body.contents.length === 0) {
      res.status(400).json({
        ok: false,
        available: true,
        error: 'Missing conversation contents array.',
      });
      return;
    }

    const todayIso =
      typeof body.todayIso === 'string' && body.todayIso.trim()
        ? body.todayIso
        : new Date().toISOString();

    const callOnce = () =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: body.contents as Parameters<typeof ai.models.generateContent>[0]['contents'],
        config: {
          systemInstruction: buildSystemInstruction(todayIso),
          tools: [{ functionDeclarations: placementToolDeclarations }],
        },
      });

    try {
      let response;
      try {
        response = await callOnce();
      } catch (firstErr) {
        const firstMsg = firstErr instanceof Error ? firstErr.message : '';
        if (firstMsg.includes('503') || firstMsg.includes('UNAVAILABLE')) {
          await new Promise((r) => setTimeout(r, 800));
          response = await callOnce();
        } else {
          throw firstErr;
        }
      }

      const candidateContent = response.candidates?.[0]?.content ?? null;
      res.json({
        ok: true,
        available: true,
        model: 'gemini-4-hydrogen',
        text: response.text ?? '',
        functionCalls: response.functionCalls ?? [],
        modelContent: candidateContent,
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Unexpected Gemini API error.';
      console.error('[CareerVault AI] Gemini API error:', raw);

      let friendly = 'Gemini API is temporarily unavailable — showing Local Demo Mode analysis.';
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.error?.status === 'UNAVAILABLE' || parsed?.error?.code === 503) {
          friendly =
            'Gemini API is temporarily busy (high demand) — showing Local Demo Mode analysis grounded in your saved records.';
        } else if (parsed?.error?.message) {
          friendly = `Gemini API unavailable (${parsed.error.message}) — showing Local Demo Mode analysis.`;
        }
      } catch {
        if (raw.includes('API_KEY') || raw.includes('PERMISSION_DENIED')) {
          friendly =
            'Gemini API key could not be verified — showing Local Demo Mode analysis grounded in your saved records.';
        } else if (raw.length < 140) {
          friendly = `Gemini API unavailable (${raw}) — showing Local Demo Mode analysis.`;
        }
      }

      res.status(502).json({
        ok: false,
        available: false,
        error: friendly,
      });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'mpa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CareerVault AI running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
