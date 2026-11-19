/**
 * AI Placement Assistant orchestrator.
 * Runs Gemini function-calling turns using agent-tools.js against real IndexedDB data,
 * and falls back transparently to Local Demo Mode when Gemini API is unavailable.
 */

import {
  getApplications,
  getUpcomingEvents,
  proposeApplicationUpdate,
  updateApplication,
} from './agent-tools.js';
import { callGeminiTurn } from './gemini.js';
import { listApplications } from './applications.js';
import { extractEvents, runLocalDemoAnalysis } from './logic.js';

const MAX_TOOL_TURNS = 4;

/**
 * Run placement analysis or respond to a user question.
 * Returns { markdown, mode: 'gemini' | 'demo', notice, toolsUsed, pendingProposals }.
 */
export async function runPlacementAssistant(userPrompt) {
  const promptText =
    String(userPrompt || '').trim() ||
    'Analyze my placement progress, highlight urgent upcoming exams or interviews, summarize pending results, and suggest my top priorities today.';

  const todayIso = new Date().toISOString();
  const toolsUsed = [];
  const pendingProposals = [];

  const contents = [{ role: 'user', parts: [{ text: promptText }] }];

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn += 1) {
    const result = await callGeminiTurn(contents, todayIso);

    if (!result.ok) {
      // Transparently fall back to Local Demo Mode grounded in real IndexedDB tool calls
      return runDemoFallback(promptText, result.error);
    }

    const calls = result.functionCalls || [];
    if (calls.length === 0) {
      return {
        markdown:
          result.text?.trim() ||
          'Analysis completed, but no summary text was returned. Try asking again.',
        mode: 'gemini',
        model: result.model,
        notice: null,
        toolsUsed,
        pendingProposals,
      };
    }

    if (result.modelContent) {
      contents.push(result.modelContent);
    }

    const responseParts = [];

    for (const fc of calls) {
      const toolName = fc.name;
      const args = fc.args || {};

      if (toolName === 'getApplications') {
        const apps = await getApplications(args);
        toolsUsed.push(`getApplications() · ${apps.length} records`);
        responseParts.push({
          functionResponse: {
            id: fc.id,
            name: toolName,
            response: { applications: apps },
          },
        });
      } else if (toolName === 'getUpcomingEvents') {
        const events = await getUpcomingEvents(args.withinDays ?? null);
        toolsUsed.push(`getUpcomingEvents() · ${events.length} upcoming`);
        responseParts.push({
          functionResponse: {
            id: fc.id,
            name: toolName,
            response: { upcomingEvents: events },
          },
        });
      } else if (toolName === 'updateApplication') {
        const proposalRes = await proposeApplicationUpdate(args);
        if (proposalRes.ok) {
          pendingProposals.push({
            id: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            ...proposalRes.proposal,
            state: 'pending',
          });
          toolsUsed.push(`updateApplication() · awaiting confirmation`);
          responseParts.push({
            functionResponse: {
              id: fc.id,
              name: toolName,
              response: {
                status: 'pending_user_confirmation',
                message:
                  'Update proposal created and shown to the user. Wait for explicit confirmation before assuming the change is applied.',
              },
            },
          });
        } else {
          responseParts.push({
            functionResponse: {
              id: fc.id,
              name: toolName,
              response: { status: 'error', error: proposalRes.error },
            },
          });
        }
      } else {
        responseParts.push({
          functionResponse: {
            id: fc.id,
            name: toolName,
            response: { status: 'error', error: `Unknown tool: ${toolName}` },
          },
        });
      }
    }

    contents.push({ role: 'user', parts: responseParts });
  }

  return runDemoFallback(promptText, 'Reached maximum tool iterations; showing local summary.');
}

async function runDemoFallback(promptText, reason) {
  const rawApplications = await listApplications();
  const toolApps = await getApplications();
  const toolEvents = await getUpcomingEvents();

  const fullUpcomingEvents = extractEvents(rawApplications, Date.now()).filter(
    (ev) => ev.round.status === 'Upcoming' || ev.round.status === 'Awaiting Result'
  );

  const demo = runLocalDemoAnalysis(promptText, rawApplications, fullUpcomingEvents, Date.now());
  const toolsUsed = [
    `getApplications() · ${toolApps.length} records`,
    `getUpcomingEvents() · ${toolEvents.length} upcoming`,
  ];

  const pendingProposals = [];
  if (demo.proposedUpdate) {
    toolsUsed.push('updateApplication() · awaiting confirmation');
    pendingProposals.push({
      id: `prop-${Date.now()}`,
      ...demo.proposedUpdate,
      state: 'pending',
    });
  }

  return {
    markdown: demo.markdown,
    mode: 'demo',
    model: 'Local Demo Mode',
    notice: reason || 'Gemini API unavailable — using Local Demo Mode with your real IndexedDB data.',
    toolsUsed,
    pendingProposals,
  };
}

/**
 * Commit a user-approved update proposal via agent-tools.js.
 */
export async function confirmAgentProposal(proposal) {
  return updateApplication(proposal.applicationId, proposal.updates);
}
