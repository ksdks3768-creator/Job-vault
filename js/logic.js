/**
 * Pure domain logic for CareerVault AI.
 * Decoupled from DOM and IndexedDB so it can be unit-tested cleanly with node:test.
 */

export const APPLICATION_STATUSES = [
  'Applied',
  'In Progress',
  'Interviewing',
  'Offer',
  'Rejected',
  'Withdrawn',
];

export const ROUND_TYPES = [
  'Online Assessment',
  'Coding Test',
  'Technical Interview',
  'System Design',
  'Managerial Round',
  'HR Interview',
  'Final Result',
];

export const ROUND_STATUSES = [
  'Upcoming',
  'Completed',
  'Passed',
  'Failed',
  'Awaiting Result',
];

export const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB

const EXAM_REGEX = /assessment|coding|test|exam|aptitude|oa\b/i;
const INTERVIEW_REGEX = /interview|technical|system design|managerial|hr\b/i;

/**
 * Safely parse a date or datetime-local string into epoch milliseconds.
 * Date-only strings (YYYY-MM-DD) are interpreted at 10:00 local time.
 */
export function parseEventTime(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Date-only format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 10, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt.getTime();
  }

  const dt = new Date(trimmed);
  return Number.isNaN(dt.getTime()) ? null : dt.getTime();
}

/**
 * Format human-readable countdown string relative to nowMs.
 */
export function formatCountdown(dateStr, nowMs = Date.now()) {
  const targetMs = parseEventTime(dateStr);
  if (targetMs === null) return 'Date TBD';

  const diffMs = targetMs - nowMs;
  const absMs = Math.abs(diffMs);
  const totalMinutes = Math.round(absMs / 60000);
  const totalHours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  const totalDays = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;

  if (diffMs < 0) {
    if (totalMinutes < 60) return `Overdue by ${Math.max(1, totalMinutes)}m`;
    if (totalHours < 24) return `Overdue by ${totalHours}h`;
    return `Overdue by ${totalDays}d`;
  }

  if (totalMinutes < 2) return 'Starting now';
  if (totalHours < 1) return `In ${totalMinutes}m`;
  if (totalHours < 24) {
    return remMinutes > 0 ? `In ${totalHours}h ${remMinutes}m` : `In ${totalHours}h`;
  }
  if (totalDays < 7) {
    return remHours > 0 ? `In ${totalDays}d ${remHours}h` : `In ${totalDays}d`;
  }
  return `In ${totalDays} days`;
}

/**
 * Classify a recruitment round's urgency and visual alert state.
 * - Red ('urgent'): Upcoming or expected result within 24 hours (or recently overdue)
 * - Orange ('soon'): Upcoming or expected result within 3 days (24h - 72h)
 * - Green ('completed'): Completed or Passed rounds
 */
export function getEventUrgency(round, nowMs = Date.now()) {
  const status = round?.status || 'Upcoming';
  const targetMs = parseEventTime(round?.date);
  const hoursRemaining = targetMs === null ? null : (targetMs - nowMs) / 3600000;

  if (status === 'Completed' || status === 'Passed') {
    return {
      level: 'completed',
      hoursRemaining,
      label: status,
      countdownText: status === 'Passed' ? 'Passed' : 'Completed',
      isUrgent24h: false,
      isSoon3d: false,
    };
  }

  if (status === 'Failed') {
    return {
      level: 'failed',
      hoursRemaining,
      label: 'Failed',
      countdownText: 'Did not advance',
      isUrgent24h: false,
      isSoon3d: false,
    };
  }

  const countdownText = formatCountdown(round?.date, nowMs);

  if (status === 'Awaiting Result') {
    if (hoursRemaining !== null && hoursRemaining > 0 && hoursRemaining <= 24) {
      return {
        level: 'urgent',
        hoursRemaining,
        label: 'Result within 24h',
        countdownText,
        isUrgent24h: true,
        isSoon3d: false,
      };
    }
    if (hoursRemaining !== null && hoursRemaining > 24 && hoursRemaining <= 72) {
      return {
        level: 'soon',
        hoursRemaining,
        label: 'Result within 3d',
        countdownText,
        isUrgent24h: false,
        isSoon3d: true,
      };
    }
    return {
      level: 'awaiting',
      hoursRemaining,
      label: 'Awaiting Result',
      countdownText: hoursRemaining !== null && hoursRemaining > 0
        ? `Expected ${countdownText.toLowerCase()}`
        : 'Awaiting Result',
      isUrgent24h: false,
      isSoon3d: false,
    };
  }

  // status === 'Upcoming'
  if (hoursRemaining !== null && hoursRemaining <= 24) {
    return {
      level: 'urgent',
      hoursRemaining,
      label: hoursRemaining < 0 ? 'Overdue · Action needed' : 'Within 24h',
      countdownText,
      isUrgent24h: true,
      isSoon3d: false,
    };
  }

  if (hoursRemaining !== null && hoursRemaining <= 72) {
    return {
      level: 'soon',
      hoursRemaining,
      label: 'Within 3 days',
      countdownText,
      isUrgent24h: false,
      isSoon3d: true,
    };
  }

  return {
    level: 'scheduled',
    hoursRemaining,
    label: 'Scheduled',
    countdownText,
    isUrgent24h: false,
    isSoon3d: false,
  };
}

/**
 * Flatten all recruitment rounds across all applications into sortable event entries.
 */
export function extractEvents(applications = [], nowMs = Date.now()) {
  const events = [];
  for (const app of applications) {
    const rounds = Array.isArray(app.rounds) ? app.rounds : [];
    for (const round of rounds) {
      const urgency = getEventUrgency(round, nowMs);
      events.push({
        id: `${app.id}::${round.id}`,
        applicationId: app.id,
        company: app.company,
        role: app.role,
        location: app.location || '',
        applicationStatus: app.status,
        round,
        urgency,
        timestamp: parseEventTime(round.date),
      });
    }
  }

  const levelRank = {
    urgent: 0,
    soon: 1,
    scheduled: 2,
    awaiting: 3,
    completed: 4,
    failed: 5,
  };

  events.sort((a, b) => {
    const rankDiff = (levelRank[a.urgency.level] ?? 9) - (levelRank[b.urgency.level] ?? 9);
    if (rankDiff !== 0) return rankDiff;
    const tA = a.timestamp ?? Number.MAX_SAFE_INTEGER;
    const tB = b.timestamp ?? Number.MAX_SAFE_INTEGER;
    if (a.urgency.level === 'completed' || a.urgency.level === 'failed') {
      return tB - tA; // Most recently completed first
    }
    return tA - tB; // Soonest upcoming first
  });

  return events;
}

/**
 * Compute Dashboard KPI summary metrics from actual saved applications.
 */
export function computeDashboardMetrics(applications = [], nowMs = Date.now()) {
  const events = extractEvents(applications, nowMs);

  let interviews = 0;
  let upcomingExams = 0;
  let pendingResults = 0;
  let urgentCount24h = 0;
  let soonCount3d = 0;
  let completedRoundsCount = 0;

  const appsWithTrackedInterview = new Set();

  for (const ev of events) {
    const roundType = ev.round.type || '';
    const roundStatus = ev.round.status || 'Upcoming';

    if (ev.urgency.isUrgent24h) urgentCount24h += 1;
    if (ev.urgency.isSoon3d) soonCount3d += 1;
    if (ev.urgency.level === 'completed') completedRoundsCount += 1;

    if (roundStatus === 'Awaiting Result') {
      pendingResults += 1;
    }

    if (roundStatus === 'Upcoming' && EXAM_REGEX.test(roundType)) {
      upcomingExams += 1;
    }

    if (
      (roundStatus === 'Upcoming' || roundStatus === 'Awaiting Result') &&
      INTERVIEW_REGEX.test(roundType)
    ) {
      interviews += 1;
      appsWithTrackedInterview.add(ev.applicationId);
    }
  }

  // Also count applications marked Interviewing that haven't logged an interview round yet
  for (const app of applications) {
    if (app.status === 'Interviewing' && !appsWithTrackedInterview.has(app.id)) {
      interviews += 1;
    }
  }

  const offers = applications.filter((a) => a.status === 'Offer').length;

  return {
    totalApplications: applications.length,
    interviews,
    upcomingExams,
    offers,
    pendingResults,
    urgentCount24h,
    soonCount3d,
    completedRoundsCount,
  };
}

/**
 * Filter and sort applications for the Applications Tracker view.
 */
export function filterApplications(applications = [], options = {}, nowMs = Date.now()) {
  const { query = '', status = 'All', sortBy = 'recent' } = options;
  const q = String(query).trim().toLowerCase();

  let list = applications.filter((app) => {
    if (status && status !== 'All' && app.status !== status) {
      return false;
    }
    if (!q) return true;
    const haystack = [
      app.company,
      app.role,
      app.location,
      app.package,
      app.status,
      app.notes,
      app.jobDescription,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  list = [...list];

  if (sortBy === 'company') {
    list.sort((a, b) => (a.company || '').localeCompare(b.company || ''));
  } else if (sortBy === 'urgent') {
    const levelRank = { urgent: 0, soon: 1, scheduled: 2, awaiting: 3, completed: 4, failed: 5 };
    const getPriorityKey = (app) => {
      const evs = extractEvents([app], nowMs).filter(
        (e) => e.round.status === 'Upcoming' || e.round.status === 'Awaiting Result'
      );
      if (evs.length === 0) return { rank: 9, time: Number.MAX_SAFE_INTEGER };
      const top = evs[0];
      return {
        rank: levelRank[top.urgency.level] ?? 9,
        time: top.timestamp ?? Number.MAX_SAFE_INTEGER,
      };
    };
    list.sort((a, b) => {
      const kA = getPriorityKey(a);
      const kB = getPriorityKey(b);
      if (kA.rank !== kB.rank) return kA.rank - kB.rank;
      return kA.time - kB.time;
    });
  } else {
    // 'recent': most recently applied / created first
    list.sort((a, b) => {
      const dA = parseEventTime(a.applicationDate) || a.createdAt || 0;
      const dB = parseEventTime(b.applicationDate) || b.createdAt || 0;
      return dB - dA;
    });
  }

  return list;
}

/**
 * Validate new or edited application form values.
 */
export function validateApplicationInput(data = {}) {
  const errors = {};
  const company = String(data.company ?? '').trim();
  const role = String(data.role ?? '').trim();
  const status = String(data.status ?? '').trim();
  const jobLink = String(data.jobLink ?? '').trim();

  if (!company) {
    errors.company = 'Company name is required.';
  } else if (company.length > 100) {
    errors.company = 'Company name must be under 100 characters.';
  }

  if (!role) {
    errors.role = 'Role / job title is required.';
  } else if (role.length > 120) {
    errors.role = 'Role must be under 120 characters.';
  }

  if (status && !APPLICATION_STATUSES.includes(status)) {
    errors.status = 'Select a valid application status.';
  }

  if (jobLink) {
    try {
      const parsed = new URL(jobLink);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.jobLink = 'Job link must start with http:// or https://.';
      }
    } catch {
      errors.jobLink = 'Enter a valid URL (e.g. https://careers.company.com/...).';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate recruitment round form values.
 */
export function validateRoundInput(data = {}) {
  const errors = {};
  const type = String(data.type ?? '').trim();
  const status = String(data.status ?? '').trim();
  const date = String(data.date ?? '').trim();

  if (!type) {
    errors.type = 'Round name is required.';
  }

  if (!ROUND_STATUSES.includes(status)) {
    errors.status = 'Select a valid round status.';
  }

  if (status === 'Upcoming' && !date) {
    errors.date = 'Date & time is required for upcoming rounds.';
  } else if (date && parseEventTime(date) === null) {
    errors.date = 'Enter a valid date and time.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate an uploaded PDF file before storing in IndexedDB.
 */
export function validatePdfFile(file) {
  if (!file) {
    return { valid: false, error: 'Please select a PDF file.' };
  }
  const name = String(file.name || '').toLowerCase();
  const mime = String(file.type || '').toLowerCase();
  const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');
  if (!isPdf) {
    return { valid: false, error: 'Only PDF files (.pdf) are supported.' };
  }
  if (typeof file.size === 'number' && file.size > MAX_PDF_BYTES) {
    return { valid: false, error: 'PDF file must be 15 MB or smaller.' };
  }
  if (typeof file.size === 'number' && file.size === 0) {
    return { valid: false, error: 'The selected PDF file is empty.' };
  }
  return { valid: true, error: null };
}

/**
 * Escape PDF text string literals safely.
 */
function escapePdfText(str) {
  return String(str)
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Generate a real, valid, single-page PDF 1.4 binary (Uint8Array) in pure JS.
 * Used to seed realistic viewable/downloadable sample resumes & JDs in IndexedDB.
 */
export function generateMinimalPdfBytes(title, lines = []) {
  const safeTitle = escapePdfText(title);
  const contentLines = [
    'BT',
    '/F1 16 Tf',
    '54 756 Td',
    `(${safeTitle}) Tj`,
    '/F1 10 Tf',
    '0 -24 Td',
    '15 TL',
  ];

  for (const line of lines.slice(0, 38)) {
    contentLines.push(`(${escapePdfText(line)}) Tj T*`);
  }
  contentLines.push('ET');
  const stream = contentLines.join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) {
    bytes[i] = pdf.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/**
 * Deterministic, strictly data-grounded Demo Mode analyzer.
 * Uses ONLY the real applications and upcomingEvents returned by agent-tools.js.
 * Never fabricates companies, dates, or statuses.
 */
export function runLocalDemoAnalysis(userPrompt, applications = [], upcomingEvents = [], nowMs = Date.now()) {
  const prompt = String(userPrompt || '').trim();
  const promptLower = prompt.toLowerCase();

  if (!applications.length) {
    return {
      markdown:
        'You do not have any job applications saved in CareerVault yet.\n\n**Next step:** Click **Add Application** to log your first company, upload the submitted resume PDF, and schedule your first recruitment round. Once saved, run **Analyze My Placement** again for a tailored action plan.',
      proposedUpdate: null,
    };
  }

  // Check if user is asking to update a specific application record
  const wantsUpdate =
    /\b(update|mark|change|set|move|sync)\b/i.test(promptLower) &&
    (APPLICATION_STATUSES.some((s) => promptLower.includes(s.toLowerCase())) ||
      /\bstatus\b|\bnote\b|\bnotes\b/i.test(promptLower));

  let proposedUpdate = null;

  if (wantsUpdate) {
    const matchedApp = applications.find((app) =>
      promptLower.includes(app.company.toLowerCase())
    );
    const matchedStatus = APPLICATION_STATUSES.find((s) =>
      promptLower.includes(s.toLowerCase())
    );

    if (matchedApp && matchedStatus && matchedApp.status !== matchedStatus) {
      proposedUpdate = {
        applicationId: matchedApp.id,
        company: matchedApp.company,
        role: matchedApp.role,
        currentValues: { status: matchedApp.status },
        updates: { status: matchedStatus },
        reason: `Requested status change for ${matchedApp.company} (${matchedApp.role}) from "${matchedApp.status}" to "${matchedStatus}".`,
      };
      return {
        markdown: `I found **${matchedApp.company} — ${matchedApp.role}** (currently **${matchedApp.status}**).\n\nBefore making any changes to your saved records, please review and confirm the proposed update below.`,
        proposedUpdate,
      };
    }
  }

  // Also check if user specifically asked to sync/review outdated statuses
  if (/\bsync\b|\breview status\b|\bupdate status\b/i.test(promptLower)) {
    const syncCandidate = applications.find((app) => {
      const hasUpcomingInterview = (app.rounds || []).some(
        (r) => r.status === 'Upcoming' && INTERVIEW_REGEX.test(r.type || '')
      );
      return hasUpcomingInterview && app.status === 'Applied';
    });

    if (syncCandidate) {
      proposedUpdate = {
        applicationId: syncCandidate.id,
        company: syncCandidate.company,
        role: syncCandidate.role,
        currentValues: { status: syncCandidate.status },
        updates: { status: 'Interviewing' },
        reason: `${syncCandidate.company} has an upcoming interview scheduled, while its application status is still "Applied".`,
      };
    }
  }

  const metrics = computeDashboardMetrics(applications, nowMs);
  const urgentEvents = upcomingEvents.filter((e) => e.urgency.isUrgent24h);
  const soonEvents = upcomingEvents.filter((e) => e.urgency.isSoon3d);
  const awaitingEvents = extractEvents(applications, nowMs).filter(
    (e) => e.round.status === 'Awaiting Result'
  );
  const offerApps = applications.filter((a) => a.status === 'Offer');
  const missingResumeApps = applications.filter(
    (a) => !a.resumeFileId && a.status !== 'Rejected' && a.status !== 'Withdrawn'
  );

  const sections = [];

  // Lead urgent headline
  if (urgentEvents.length > 0) {
    const top = urgentEvents[0];
    const hrs = top.urgency.hoursRemaining;
    const timingPhrase =
      hrs !== null && hrs < 0
        ? 'is overdue'
        : hrs !== null && hrs <= 12
        ? `is today (${top.urgency.countdownText.toLowerCase()})`
        : `is tomorrow (${top.urgency.countdownText.toLowerCase()})`;
    sections.push(
      `**Top Priority:** Your **${top.company}** ${top.round.type} ${timingPhrase}. Prioritize preparation today${
        top.round.notes ? ` — focus on: ${top.round.notes}` : '.'
      }`
    );
  } else if (soonEvents.length > 0) {
    const next = soonEvents[0];
    sections.push(
      `**Next Up:** Your **${next.company}** ${next.round.type} is coming up (${next.urgency.countdownText.toLowerCase()}). Plan dedicated prep blocks over the next 48 hours.`
    );
  } else {
    sections.push(
      `**Placement Snapshot:** You are tracking **${metrics.totalApplications}** application${
        metrics.totalApplications === 1 ? '' : 's'
      } with no urgent deadlines in the next 24 hours.`
    );
  }

  // Progress summary
  const summaryBullets = [
    `- **Pipeline Overview:** ${metrics.totalApplications} total applications, ${metrics.upcomingExams} upcoming exam${
      metrics.upcomingExams === 1 ? '' : 's'
    }, ${metrics.interviews} active interview${metrics.interviews === 1 ? '' : 's'}, ${
      metrics.pendingResults
    } pending result${metrics.pendingResults === 1 ? '' : 's'}, and ${metrics.offers} offer${
      metrics.offers === 1 ? '' : 's'
    }.`,
  ];

  if (offerApps.length > 0) {
    summaryBullets.push(
      `- **Offers Received:** ${offerApps
        .map((a) => `${a.company} (${a.role}${a.package ? `, ${a.package}` : ''})`)
        .join('; ')}.`
    );
  }

  if (urgentEvents.length > 1) {
    summaryBullets.push(
      `- **Other Urgent Events (< 24h):** ${urgentEvents
        .slice(1)
        .map((e) => `${e.company} ${e.round.type} (${e.urgency.countdownText})`)
        .join(', ')}.`
    );
  }

  if (soonEvents.length > 0) {
    summaryBullets.push(
      `- **Within 3 Days:** ${soonEvents
        .map((e) => `${e.company} ${e.round.type} (${e.urgency.countdownText})`)
        .join(', ')}.`
    );
  }

  if (awaitingEvents.length > 0) {
    summaryBullets.push(
      `- **Pending Results:** ${awaitingEvents
        .map((e) => `${e.company} (${e.round.type})`)
        .join(', ')} — consider sending a polite follow-up if it has been over 5 business days.`
    );
  }

  sections.push(summaryBullets.join('\n'));

  // Concrete next priorities
  const nextSteps = [];
  if (urgentEvents.length > 0) {
    nextSteps.push(
      `1. Review the saved job description and resume for **${urgentEvents[0].company}** before your **${urgentEvents[0].round.type}**.`
    );
  }
  if (soonEvents.length > 0) {
    nextSteps.push(
      `${nextSteps.length + 1}. Prepare targeted questions and technical topics for **${soonEvents[0].company}** (${soonEvents[0].round.type}).`
    );
  }
  if (missingResumeApps.length > 0) {
    nextSteps.push(
      `${nextSteps.length + 1}. Upload the submitted resume PDF for **${missingResumeApps
        .slice(0, 2)
        .map((a) => a.company)
        .join(' and ')}** so your Resume Vault stays complete.`
    );
  }
  if (nextSteps.length === 0) {
    nextSteps.push('1. Keep logging new target companies and upcoming recruitment rounds to maintain momentum.');
  }

  sections.push(`**Recommended Next Priorities:**\n${nextSteps.join('\n')}`);

  if (proposedUpdate) {
    sections.push(
      `I also noticed **${proposedUpdate.company}** can be updated to **${proposedUpdate.updates.status}**. Confirm below if you want me to save that change.`
    );
  }

  return {
    markdown: sections.join('\n\n'),
    proposedUpdate,
  };
}
