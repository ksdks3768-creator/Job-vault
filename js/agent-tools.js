/**
 * AI Agent Tool Functions for CareerVault AI.
 * Each tool reads or updates real user records stored in IndexedDB.
 * Write operations (updateApplication) are ALWAYS gated behind explicit user confirmation.
 */

import { listApplications, fetchApplication, editApplication } from './applications.js';
import { extractEvents, APPLICATION_STATUSES } from './logic.js';

/**
 * Tool 1: getApplications(filters)
 * Returns saved applications from IndexedDB in a concise, AI-readable structure.
 */
export async function getApplications(filters = {}) {
  const all = await listApplications();
  const statusFilter = filters?.status ? String(filters.status).trim().toLowerCase() : '';
  const queryFilter = filters?.query ? String(filters.query).trim().toLowerCase() : '';

  const filtered = all.filter((app) => {
    if (statusFilter && app.status.toLowerCase() !== statusFilter) return false;
    if (queryFilter) {
      const hay = `${app.company} ${app.role} ${app.location}`.toLowerCase();
      if (!hay.includes(queryFilter)) return false;
    }
    return true;
  });

  return filtered.map((app) => ({
    id: app.id,
    company: app.company,
    role: app.role,
    location: app.location,
    applicationDate: app.applicationDate,
    package: app.package,
    status: app.status,
    notes: app.notes,
    hasResumePdf: Boolean(app.resumeFileId),
    hasJobDescription: Boolean(app.jobDescription || app.jdFileId),
    rounds: (app.rounds || []).map((r) => ({
      id: r.id,
      type: r.type,
      date: r.date,
      status: r.status,
      notes: r.notes,
    })),
  }));
}

/**
 * Tool 2: getUpcomingEvents(withinDays)
 * Returns upcoming assessments, interviews, and pending result events with countdowns and urgency.
 */
export async function getUpcomingEvents(withinDays = null) {
  const all = await listApplications();
  const nowMs = Date.now();
  const events = extractEvents(all, nowMs).filter(
    (ev) => ev.round.status === 'Upcoming' || ev.round.status === 'Awaiting Result'
  );

  const filtered =
    typeof withinDays === 'number' && Number.isFinite(withinDays) && withinDays > 0
      ? events.filter(
          (ev) =>
            ev.urgency.hoursRemaining !== null && ev.urgency.hoursRemaining <= withinDays * 24
        )
      : events;

  return filtered.map((ev) => ({
    applicationId: ev.applicationId,
    company: ev.company,
    role: ev.role,
    roundId: ev.round.id,
    roundType: ev.round.type,
    date: ev.round.date,
    roundStatus: ev.round.status,
    notes: ev.round.notes,
    urgencyLevel: ev.urgency.level,
    urgencyLabel: ev.urgency.label,
    countdownText: ev.urgency.countdownText,
    hoursRemaining:
      ev.urgency.hoursRemaining !== null ? Math.round(ev.urgency.hoursRemaining * 10) / 10 : null,
  }));
}

/**
 * Build a verified confirmation proposal without mutating IndexedDB.
 * Used when the AI invokes updateApplication() so the user must approve first.
 */
export async function proposeApplicationUpdate(args = {}) {
  const applicationId = String(args.applicationId || '').trim();
  if (!applicationId) {
    return { ok: false, error: 'Missing applicationId for update proposal.' };
  }

  const existing = await fetchApplication(applicationId);
  if (!existing) {
    return { ok: false, error: `No application found with ID "${applicationId}".` };
  }

  const updates = {};
  const currentValues = {};

  if (typeof args.status === 'string' && args.status.trim()) {
    const cleanStatus = args.status.trim();
    if (!APPLICATION_STATUSES.includes(cleanStatus)) {
      return { ok: false, error: `Invalid status "${cleanStatus}".` };
    }
    if (cleanStatus !== existing.status) {
      currentValues.status = existing.status;
      updates.status = cleanStatus;
    }
  }

  if (typeof args.notes === 'string' && args.notes.trim() !== existing.notes) {
    currentValues.notes = existing.notes || '(empty)';
    updates.notes = args.notes.trim();
  }

  if (typeof args.package === 'string' && args.package.trim() !== existing.package) {
    currentValues.package = existing.package || '(empty)';
    updates.package = args.package.trim();
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: 'Proposed values already match the saved record.' };
  }

  return {
    ok: true,
    proposal: {
      applicationId: existing.id,
      company: existing.company,
      role: existing.role,
      currentValues,
      updates,
      reason: String(args.reason || 'Suggested update from CareerVault AI.').trim(),
    },
  };
}

/**
 * Tool 3: updateApplication(applicationId, updates)
 * Commits a user-confirmed update to IndexedDB.
 */
export async function updateApplication(applicationId, updates) {
  return editApplication(applicationId, updates);
}
