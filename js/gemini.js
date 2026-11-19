/**
 * Gemini API client bridge for CareerVault AI.
 * Communicates with the server-side /api/gemini/analyze endpoint so no API key is ever exposed in the browser.
 * Returns { available: false } cleanly when running offline/static or when no API key is configured.
 */

export async function checkGeminiAvailability() {
  try {
    const res = await fetch('/api/health', { method: 'GET' });
    if (!res.ok) return { available: false };
    const data = await res.json();
    return { available: Boolean(data.geminiConfigured) };
  } catch {
    return { available: false };
  }
}

export async function callGeminiTurn(contents, todayIso = new Date().toISOString()) {
  try {
    const res = await fetch('/api/gemini/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, todayIso }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        available: false,
        error: 'Gemini server proxy is not active in static hosting mode.',
      };
    }

    const data = await res.json();
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        available: Boolean(data.available),
        error: data.error || `Gemini API responded with status ${res.status}.`,
      };
    }

    return {
      ok: true,
      available: true,
      model: data.model || 'gemini-4-hydrogen',
      text: data.text || '',
      functionCalls: Array.isArray(data.functionCalls) ? data.functionCalls : [],
      modelContent: data.modelContent || null,
    };
  } catch {
    return {
      ok: false,
      available: false,
      error: 'Unable to reach /api/gemini/analyze. Running Local Demo Mode.',
    };
  }
}
