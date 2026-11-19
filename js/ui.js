/**
 * Modular HTML view renderers for CareerVault AI.
 * Keeps rendering pure, accessible, and XSS-safe.
 */

import {
  APPLICATION_STATUSES,
  ROUND_STATUSES,
  computeDashboardMetrics,
  extractEvents,
  filterApplications,
  getEventUrgency,
  parseEventTime,
} from './logic.js';

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDateTime(dateStr) {
  const ts = parseEventTime(dateStr);
  if (ts === null) return 'Date TBD';
  const dt = new Date(ts);
  return dt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatShortDate(dateStr) {
  const ts = parseEventTime(dateStr);
  if (ts === null) return '—';
  const dt = new Date(ts);
  return dt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatFileSize(bytes) {
  if (!bytes || typeof bytes !== 'number') return 'PDF';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function statusToneClass(status) {
  switch (status) {
    case 'Offer':
    case 'Completed':
    case 'Passed':
      return 'tone-completed';
    case 'Interviewing':
    case 'In Progress':
      return 'tone-scheduled';
    case 'Awaiting Result':
      return 'tone-awaiting';
    case 'Rejected':
    case 'Failed':
      return 'tone-failed';
    default:
      return 'tone-muted';
  }
}

export function renderMarkdownSafe(md) {
  const escaped = escapeHtml(md || '');
  const lines = escaped.split('\n');
  const html = [];
  let listType = null;

  const formatInline = (text) =>
    text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');

  const closeList = () => {
    if (listType) {
      html.push(listType === 'ol' ? '</ol>' : '</ul>');
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.+)/);
    const olMatch = line.match(/^\d+\.\s+(.+)/);

    if (ulMatch) {
      if (listType !== 'ul') {
        closeList();
        html.push('<ul>');
        listType = 'ul';
      }
      html.push(`<li>${formatInline(ulMatch[1])}</li>`);
    } else if (olMatch) {
      if (listType !== 'ol') {
        closeList();
        html.push('<ol>');
        listType = 'ol';
      }
      html.push(`<li>${formatInline(olMatch[1])}</li>`);
    } else {
      closeList();
      html.push(`<p>${formatInline(line)}</p>`);
    }
  }

  closeList();
  return html.join('');
}

// ============================================================================
// 1. Dashboard View
// ============================================================================

export function renderDashboardView(state) {
  const nowMs = Date.now();
  const metrics = computeDashboardMetrics(state.applications, nowMs);
  const allEvents = extractEvents(state.applications, nowMs);
  const activeEvents = allEvents
    .filter((e) => e.round.status === 'Upcoming' || e.round.status === 'Awaiting Result')
    .slice(0, 6);
  const recentApps = filterApplications(state.applications, { sortBy: 'recent' }, nowMs).slice(0, 6);

  const urgentHeadline =
    metrics.urgentCount24h > 0
      ? `${metrics.urgentCount24h} urgent event${metrics.urgentCount24h === 1 ? '' : 's'} within 24 hours. Run placement analysis to prioritize today’s prep.`
      : metrics.soonCount3d > 0
      ? `${metrics.soonCount3d} upcoming event${metrics.soonCount3d === 1 ? '' : 's'} within 3 days. Get a focused action plan from your saved applications.`
      : 'Analyze your saved applications, recruitment timelines, and pending results to plan your next move.';

  return `
    <div class="view-enter">
      <div class="page-header">
        <div>
          <h1 class="page-title">Placement Overview</h1>
          <p class="page-subtitle">Track applications, exams, interviews, resumes, and results in one private workspace.</p>
        </div>
      </div>

      <section class="kpi-grid" aria-label="Placement summary metrics" data-testid="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-label">Total Applications</span>
          <span class="kpi-value" data-testid="kpi-total">${metrics.totalApplications}</span>
          <span class="kpi-meta">Saved in vault</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Interviews</span>
          <span class="kpi-value accent" data-testid="kpi-interviews">${metrics.interviews}</span>
          <span class="kpi-meta">Active &amp; scheduled</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Upcoming Exams</span>
          <span class="kpi-value ${metrics.urgentCount24h > 0 ? 'tone-urgent' : ''}" data-testid="kpi-exams">${metrics.upcomingExams}</span>
          <span class="kpi-meta">${metrics.urgentCount24h > 0 ? `${metrics.urgentCount24h} within 24h` : 'Assessments & tests'}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Offers</span>
          <span class="kpi-value completed" data-testid="kpi-offers">${metrics.offers}</span>
          <span class="kpi-meta">Offers received</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Pending Results</span>
          <span class="kpi-value soon" data-testid="kpi-pending">${metrics.pendingResults}</span>
          <span class="kpi-meta">Awaiting decision</span>
        </div>
      </section>

      <section class="ai-banner" aria-label="AI Placement Assistant shortcut">
        <div class="ai-banner-text">
          <h2>AI Placement Assistant</h2>
          <p>${escapeHtml(urgentHeadline)}</p>
        </div>
        <button type="button" class="btn btn-primary" data-action="analyze-placement">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4L12 3z" />
          </svg>
          <span>Analyze My Placement</span>
        </button>
      </section>

      <div class="dashboard-split">
        <section class="surface-panel" aria-labelledby="dashEventsHeading">
          <div class="panel-header">
            <div>
              <h2 class="panel-title" id="dashEventsHeading">Upcoming Schedule &amp; Alerts</h2>
              <p class="panel-subtitle">Red within 24h · Orange within 3 days · Green when completed</p>
            </div>
            <button type="button" class="text-link-btn" data-nav="events">View all</button>
          </div>

          ${
            activeEvents.length === 0
              ? `<div class="empty-state">
                  <h3>No upcoming events scheduled</h3>
                  <p>Open any application and add an assessment, interview, or expected result date to track countdowns.</p>
                </div>`
              : `<div class="list-rows">
                  ${activeEvents.map((ev) => renderCompactEventRow(ev)).join('')}
                </div>`
          }
        </section>

        <section class="surface-panel" aria-labelledby="dashAppsHeading">
          <div class="panel-header">
            <div>
              <h2 class="panel-title" id="dashAppsHeading">Recent Applications</h2>
              <p class="panel-subtitle">Click any company to open full details, timeline, resume &amp; JD</p>
            </div>
            <button type="button" class="text-link-btn" data-nav="applications">View all</button>
          </div>

          ${
            recentApps.length === 0
              ? `<div class="empty-state">
                  <h3>Your vault is empty</h3>
                  <p>Add your first job application or load sample placement data to explore.</p>
                  <div class="empty-actions">
                    <button type="button" class="btn btn-primary btn-sm" data-action="open-add-app">Add First Application</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-action="load-samples">Load Sample Data</button>
                  </div>
                </div>`
              : `<div class="list-rows">
                  ${recentApps
                    .map((app) => {
                      const nextEv = extractEvents([app], nowMs).find(
                        (e) => e.round.status === 'Upcoming' || e.round.status === 'Awaiting Result'
                      );
                      return `
                        <div class="event-row">
                          <div class="event-main">
                            <div class="event-heading">
                              <button type="button" class="company-link-btn" data-open-app="${escapeHtml(app.id)}">
                                ${escapeHtml(app.company)}
                              </button>
                            </div>
                            <div class="table-role" style="margin-top:2px;">${escapeHtml(app.role)}</div>
                            ${
                              app.package || app.location
                                ? `<div class="meta-line">
                                    ${app.package ? `<span class="tabular">${escapeHtml(app.package)}</span>` : ''}
                                    ${app.package && app.location ? '<span class="meta-sep" aria-hidden="true">·</span>' : ''}
                                    ${app.location ? `<span>${escapeHtml(app.location)}</span>` : ''}
                                  </div>`
                                : ''
                            }
                          </div>
                          <div class="event-right">
                            <span class="status-text ${statusToneClass(app.status)}">${escapeHtml(app.status)}</span>
                            <span class="meta-line" style="margin-top:0;">
                              ${
                                nextEv
                                  ? `<span class="tabular tone-${nextEv.urgency.level}">${escapeHtml(nextEv.round.type)} · ${escapeHtml(nextEv.urgency.countdownText)}</span>`
                                  : `<span class="tabular">${escapeHtml(formatShortDate(app.applicationDate))}</span>`
                              }
                            </span>
                          </div>
                        </div>
                      `;
                    })
                    .join('')}
                </div>`
          }
        </section>
      </div>
    </div>
  `;
}

function renderCompactEventRow(ev) {
  const { urgency, round } = ev;
  return `
    <div class="event-row level-${urgency.level}">
      <div class="event-main">
        <div class="event-heading">
          ${urgency.isUrgent24h ? '<span class="urgent-dot" aria-label="Urgent within 24 hours"></span>' : ''}
          <button type="button" class="company-link-btn" data-open-app="${escapeHtml(ev.applicationId)}">
            ${escapeHtml(ev.company)} — ${escapeHtml(round.type)}
          </button>
        </div>
        <div class="meta-line">
          <span>${escapeHtml(ev.role)}</span>
          <span class="meta-sep" aria-hidden="true">·</span>
          <span class="tabular">${escapeHtml(formatDateTime(round.date))}</span>
        </div>
        ${round.notes ? `<p class="event-notes">${escapeHtml(round.notes)}</p>` : ''}
      </div>
      <div class="event-right">
        <span class="countdown-label tone-${urgency.level}">${escapeHtml(urgency.countdownText)}</span>
        <span class="status-text tone-${urgency.level}">${escapeHtml(urgency.label)}</span>
      </div>
    </div>
  `;
}

// ============================================================================
// 2. Applications Tracker View
// ============================================================================

export function renderApplicationsView(state) {
  const nowMs = Date.now();
  const filtered = filterApplications(
    state.applications,
    {
      query: state.appSearch,
      status: state.appStatusFilter,
      sortBy: state.appSortBy,
    },
    nowMs
  );

  const filterTabs = ['All', ...APPLICATION_STATUSES];

  return `
    <div class="view-enter">
      <div class="page-header">
        <div>
          <h1 class="page-title">Applications</h1>
          <p class="page-subtitle">Manage every company you applied to, filter by stage, and open full dossiers.</p>
        </div>
      </div>

      <div class="toolbar">
        <div class="search-wrap">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            id="applicationsSearchInput"
            class="search-input"
            placeholder="Search company, role, location, notes..."
            value="${escapeHtml(state.appSearch)}"
            aria-label="Search applications"
          />
        </div>

        <div class="segmented-group" role="tablist" aria-label="Filter applications by status">
          ${filterTabs
            .map(
              (tab) => `
              <button
                type="button"
                role="tab"
                aria-selected="${state.appStatusFilter === tab ? 'true' : 'false'}"
                class="segmented-btn ${state.appStatusFilter === tab ? 'active' : ''}"
                data-app-status-filter="${escapeHtml(tab)}"
              >
                ${escapeHtml(tab)}
              </button>
            `
            )
            .join('')}
        </div>

        <select id="applicationsSortSelect" class="sort-select" aria-label="Sort applications">
          <option value="recent" ${state.appSortBy === 'recent' ? 'selected' : ''}>Sort: Most Recent</option>
          <option value="urgent" ${state.appSortBy === 'urgent' ? 'selected' : ''}>Sort: Next Event Soonest</option>
          <option value="company" ${state.appSortBy === 'company' ? 'selected' : ''}>Sort: Company A–Z</option>
        </select>
      </div>

      <section class="surface-panel">
        ${
          state.applications.length === 0
            ? `<div class="empty-state">
                <h3>No applications saved yet</h3>
                <p>Track your target roles, upload the exact resume PDF submitted, and add upcoming rounds.</p>
                <div class="empty-actions">
                  <button type="button" class="btn btn-primary" data-action="open-add-app">Add First Application</button>
                  <button type="button" class="btn btn-secondary" data-action="load-samples">Load Sample Applications</button>
                </div>
              </div>`
            : filtered.length === 0
            ? `<div class="empty-state">
                <h3>No matching applications</h3>
                <p>No saved applications match your current search or status filter.</p>
                <div class="empty-actions">
                  <button type="button" class="btn btn-secondary" data-action="clear-app-filters">Clear Filters</button>
                </div>
              </div>`
            : `<div class="table-scroll">
                <table class="data-table" data-testid="applications-table">
                  <thead>
                    <tr>
                      <th>Company &amp; Role</th>
                      <th>Location</th>
                      <th>Package</th>
                      <th>Status</th>
                      <th>Next Event / Progress</th>
                      <th>Vault</th>
                      <th class="cell-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filtered
                      .map((app) => {
                        const events = extractEvents([app], nowMs);
                        const nextEv = events.find(
                          (e) => e.round.status === 'Upcoming' || e.round.status === 'Awaiting Result'
                        );
                        const completedCount = (app.rounds || []).filter(
                          (r) => r.status === 'Completed' || r.status === 'Passed'
                        ).length;
                        const vaultParts = [];
                        if (app.resumeFileId) vaultParts.push('Resume PDF');
                        if (app.jdFileId) vaultParts.push('JD PDF');
                        else if (app.jobDescription) vaultParts.push('JD Text');

                        return `
                          <tr>
                            <td>
                              <div class="table-company-cell">
                                <button type="button" class="company-link-btn" data-open-app="${escapeHtml(app.id)}">
                                  ${escapeHtml(app.company)}
                                </button>
                                <span class="table-role">${escapeHtml(app.role)}</span>
                              </div>
                            </td>
                            <td>${escapeHtml(app.location || '—')}</td>
                            <td class="tabular">${escapeHtml(app.package || '—')}</td>
                            <td>
                              <span class="status-text ${statusToneClass(app.status)}">${escapeHtml(app.status)}</span>
                            </td>
                            <td>
                              ${
                                nextEv
                                  ? `<div class="event-heading" style="gap:6px;">
                                      ${nextEv.urgency.isUrgent24h ? '<span class="urgent-dot" aria-hidden="true"></span>' : ''}
                                      <span>${escapeHtml(nextEv.round.type)}</span>
                                    </div>
                                    <span class="tabular status-text tone-${nextEv.urgency.level}">
                                      ${escapeHtml(nextEv.urgency.countdownText)} · ${escapeHtml(nextEv.urgency.label)}
                                    </span>`
                                  : completedCount > 0
                                  ? `<span class="status-text tone-completed">${completedCount} round${completedCount === 1 ? '' : 's'} completed</span>`
                                  : `<span class="tone-muted">No rounds logged</span>`
                              }
                            </td>
                            <td class="tone-muted" style="font-size:13px;">
                              ${vaultParts.length ? escapeHtml(vaultParts.join(' · ')) : 'None'}
                            </td>
                            <td class="cell-right">
                              <div class="row-actions">
                                <button
                                  type="button"
                                  class="btn btn-ghost btn-sm"
                                  data-open-app="${escapeHtml(app.id)}"
                                  aria-label="Open details for ${escapeHtml(app.company)}"
                                >
                                  Open
                                </button>
                                <button
                                  type="button"
                                  class="btn btn-ghost btn-sm"
                                  data-edit-app="${escapeHtml(app.id)}"
                                  aria-label="Edit ${escapeHtml(app.company)}"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  class="btn btn-danger-ghost btn-sm"
                                  data-delete-app="${escapeHtml(app.id)}"
                                  aria-label="Delete ${escapeHtml(app.company)}"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        `;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>`
        }
      </section>
    </div>
  `;
}

// ============================================================================
// 3. Application Details View
// ============================================================================

export function renderApplicationDetailView(state) {
  const app = state.applications.find((a) => a.id === state.selectedAppId);
  if (!app) {
    return `
      <div class="view-enter surface-panel">
        <div class="empty-state">
          <h3>Application not found</h3>
          <p>This record may have been deleted.</p>
          <button type="button" class="btn btn-primary" data-nav="applications">Back to Applications</button>
        </div>
      </div>
    `;
  }

  const nowMs = Date.now();
  const rounds = [...(app.rounds || [])].sort((a, b) => {
    const tA = parseEventTime(a.date) ?? Number.MAX_SAFE_INTEGER;
    const tB = parseEventTime(b.date) ?? Number.MAX_SAFE_INTEGER;
    return tA - tB;
  });

  const resumeFileMeta = state.files.find((f) => f.id === app.resumeFileId);
  const jdFileMeta = state.files.find((f) => f.id === app.jdFileId);

  return `
    <div class="view-enter">
      <section class="surface-panel detail-header-panel">
        <div>
          <h1 class="detail-title">${escapeHtml(app.company)}</h1>
          <p class="detail-role">${escapeHtml(app.role)}</p>
          <div class="meta-line" style="margin-top:8px;">
            ${app.location ? `<span>${escapeHtml(app.location)}</span><span class="meta-sep" aria-hidden="true">·</span>` : ''}
            ${app.package ? `<span class="tabular">${escapeHtml(app.package)}</span><span class="meta-sep" aria-hidden="true">·</span>` : ''}
            <span>Applied <span class="tabular">${escapeHtml(formatShortDate(app.applicationDate))}</span></span>
            ${
              app.jobLink
                ? `<span class="meta-sep" aria-hidden="true">·</span><a href="${escapeHtml(app.jobLink)}" target="_blank" rel="noopener noreferrer">Job Posting Link</a>`
                : ''
            }
          </div>
        </div>

        <div class="detail-actions">
          <label for="detailStatusSelect" class="visually-hidden-input">Application status</label>
          <select
            id="detailStatusSelect"
            class="sort-select"
            data-quick-app-status="${escapeHtml(app.id)}"
            aria-label="Update status for ${escapeHtml(app.company)}"
          >
            ${APPLICATION_STATUSES.map(
              (st) =>
                `<option value="${escapeHtml(st)}" ${app.status === st ? 'selected' : ''}>${escapeHtml(st)}</option>`
            ).join('')}
          </select>
          <button type="button" class="btn btn-secondary" data-edit-app="${escapeHtml(app.id)}">
            Edit Details
          </button>
          <button type="button" class="btn btn-danger-ghost" data-delete-app="${escapeHtml(app.id)}">
            Delete
          </button>
        </div>
      </section>

      <div class="detail-grid">
        <div class="detail-column">
          <!-- Recruitment Timeline -->
          <section class="surface-panel" aria-labelledby="timelineHeading">
            <div class="panel-header">
              <div>
                <h2 class="panel-title" id="timelineHeading">Recruitment Timeline</h2>
                <p class="panel-subtitle">${rounds.length} round${rounds.length === 1 ? '' : 's'} tracked</p>
              </div>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                data-open-add-round="${escapeHtml(app.id)}"
              >
                + Add Round
              </button>
            </div>

            ${
              rounds.length === 0
                ? `<div class="empty-state">
                    <h3>No recruitment rounds logged</h3>
                    <p>Add an Online Assessment, Coding Test, Technical Interview, HR Interview, or Final Result to track dates and alerts.</p>
                    <button type="button" class="btn btn-secondary btn-sm" data-open-add-round="${escapeHtml(app.id)}">
                      Add First Round
                    </button>
                  </div>`
                : `<div class="timeline" data-testid="round-timeline">
                    ${rounds
                      .map((round) => {
                        const urgency = getEventUrgency(round, nowMs);
                        return `
                          <div class="timeline-item level-${urgency.level}">
                            <div class="timeline-rail">
                              <span class="timeline-marker level-${urgency.level}" aria-hidden="true"></span>
                            </div>
                            <div>
                              <div class="timeline-top">
                                <div>
                                  <div class="event-heading">
                                    <span class="timeline-round-name">${escapeHtml(round.type)}</span>
                                  </div>
                                  <div class="meta-line">
                                    <span class="tabular">${escapeHtml(formatDateTime(round.date))}</span>
                                    <span class="meta-sep" aria-hidden="true">·</span>
                                    <span class="status-text tone-${urgency.level}">${escapeHtml(urgency.label)}</span>
                                  </div>
                                </div>
                                <span class="countdown-label tone-${urgency.level}">
                                  ${escapeHtml(urgency.countdownText)}
                                </span>
                              </div>
                              ${round.notes ? `<p class="event-notes">${escapeHtml(round.notes)}</p>` : ''}
                              <div class="timeline-controls">
                                <select
                                  class="inline-status-select"
                                  data-quick-round-status="${escapeHtml(app.id)}::${escapeHtml(round.id)}"
                                  aria-label="Update status for ${escapeHtml(round.type)}"
                                >
                                  ${ROUND_STATUSES.map(
                                    (st) =>
                                      `<option value="${escapeHtml(st)}" ${round.status === st ? 'selected' : ''}>${escapeHtml(st)}</option>`
                                  ).join('')}
                                </select>
                                <button
                                  type="button"
                                  class="btn btn-ghost btn-sm"
                                  data-edit-round="${escapeHtml(app.id)}::${escapeHtml(round.id)}"
                                  aria-label="Edit ${escapeHtml(round.type)}"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  class="btn btn-danger-ghost btn-sm"
                                  data-delete-round="${escapeHtml(app.id)}::${escapeHtml(round.id)}"
                                  aria-label="Delete ${escapeHtml(round.type)}"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        `;
                      })
                      .join('')}
                  </div>`
            }
          </section>

          <!-- Notes & Results -->
          <section class="surface-panel" aria-labelledby="notesHeading">
            <div class="panel-header">
              <div>
                <h2 class="panel-title" id="notesHeading">Notes &amp; Preparation</h2>
                <p class="panel-subtitle">Keep interview takeaways, referral details, or recruiter contacts</p>
              </div>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                data-save-notes="${escapeHtml(app.id)}"
              >
                Save Notes
              </button>
            </div>
            <div class="panel-body">
              <label for="detailNotesTextarea" class="visually-hidden-input">Application notes</label>
              <textarea
                id="detailNotesTextarea"
                class="notes-textarea"
                rows="4"
                placeholder="Write preparation notes, questions asked, or offer terms..."
              >${escapeHtml(app.notes || '')}</textarea>
            </div>
          </section>
        </div>

        <div class="detail-column">
          <!-- Submitted Resume Vault -->
          <section class="surface-panel" aria-labelledby="resumeVaultHeading">
            <div class="panel-header">
              <div>
                <h2 class="panel-title" id="resumeVaultHeading">Submitted Resume Vault</h2>
                <p class="panel-subtitle">Exact PDF version submitted to ${escapeHtml(app.company)}</p>
              </div>
            </div>
            <div class="panel-body">
              ${
                app.resumeFileId
                  ? `<div class="doc-file-row">
                      <div class="doc-file-info">
                        <p class="doc-file-name">${escapeHtml(app.resumeFileName || 'Resume.pdf')}</p>
                        <div class="meta-line">
                          <span class="tabular">${escapeHtml(formatFileSize(resumeFileMeta?.size))}</span>
                          <span class="meta-sep" aria-hidden="true">·</span>
                          <span>Stored in IndexedDB</span>
                        </div>
                      </div>
                    </div>
                    <div class="doc-actions">
                      <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        data-view-pdf="${escapeHtml(app.resumeFileId)}"
                        aria-label="View Resume PDF for ${escapeHtml(app.company)}"
                      >
                        View PDF
                      </button>
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        data-download-pdf="${escapeHtml(app.resumeFileId)}"
                        aria-label="Download Resume PDF for ${escapeHtml(app.company)}"
                      >
                        Download
                      </button>
                      <label class="upload-label-btn">
                        Replace PDF
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          class="visually-hidden-input"
                          data-upload-pdf="${escapeHtml(app.id)}::resume"
                          aria-label="Replace Resume PDF for ${escapeHtml(app.company)}"
                        />
                      </label>
                      <button
                        type="button"
                        class="btn btn-danger-ghost btn-sm"
                        data-remove-pdf="${escapeHtml(app.id)}::resume"
                        aria-label="Remove Resume PDF for ${escapeHtml(app.company)}"
                      >
                        Remove
                      </button>
                    </div>`
                  : `<div class="empty-state" style="padding:24px 12px;">
                      <h3>No resume uploaded yet</h3>
                      <p>Upload the exact PDF submitted for this role so you can review it before interviews.</p>
                      <label class="btn btn-primary btn-sm">
                        Upload Resume PDF
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          class="visually-hidden-input"
                          data-upload-pdf="${escapeHtml(app.id)}::resume"
                          aria-label="Upload Resume PDF for ${escapeHtml(app.company)}"
                        />
                      </label>
                    </div>`
              }
            </div>
          </section>

          <!-- Job Description Vault -->
          <section class="surface-panel" aria-labelledby="jdVaultHeading">
            <div class="panel-header">
              <div>
                <h2 class="panel-title" id="jdVaultHeading">Job Description Vault</h2>
                <p class="panel-subtitle">Saved JD text and uploaded PDF document</p>
              </div>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                data-toggle-jd-edit="${escapeHtml(app.id)}"
              >
                ${state.editingJd ? 'Cancel Edit' : 'Edit JD Text'}
              </button>
            </div>
            <div class="panel-body">
              <div class="doc-file-row" style="flex-direction:column; align-items:stretch;">
                ${
                  app.jdFileId
                    ? `<div class="doc-file-info">
                        <p class="doc-file-name">${escapeHtml(app.jdFileName || 'Job_Description.pdf')}</p>
                        <div class="meta-line">
                          <span class="tabular">${escapeHtml(formatFileSize(jdFileMeta?.size))}</span>
                          <span class="meta-sep" aria-hidden="true">·</span>
                          <span>JD PDF · Stored in IndexedDB</span>
                        </div>
                      </div>
                      <div class="doc-actions">
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          data-view-pdf="${escapeHtml(app.jdFileId)}"
                          aria-label="View JD PDF for ${escapeHtml(app.company)}"
                        >
                          View PDF
                        </button>
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          data-download-pdf="${escapeHtml(app.jdFileId)}"
                          aria-label="Download JD PDF for ${escapeHtml(app.company)}"
                        >
                          Download
                        </button>
                        <label class="upload-label-btn">
                          Replace PDF
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            class="visually-hidden-input"
                            data-upload-pdf="${escapeHtml(app.id)}::jd"
                            aria-label="Replace JD PDF for ${escapeHtml(app.company)}"
                          />
                        </label>
                      </div>`
                    : `<div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                        <div class="doc-file-info">
                          <p class="doc-file-name">JD PDF Attachment</p>
                          <p class="meta-line">No JD PDF uploaded yet</p>
                        </div>
                        <label class="upload-label-btn">
                          Upload JD PDF
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            class="visually-hidden-input"
                            data-upload-pdf="${escapeHtml(app.id)}::jd"
                            aria-label="Upload JD PDF for ${escapeHtml(app.company)}"
                          />
                        </label>
                      </div>`
                }
              </div>

              ${
                state.editingJd
                  ? `<div>
                      <label for="detailJdTextarea" class="visually-hidden-input">Job description text</label>
                      <textarea
                        id="detailJdTextarea"
                        class="notes-textarea"
                        rows="8"
                        placeholder="Paste the full job description here..."
                      >${escapeHtml(app.jobDescription || '')}</textarea>
                      <div style="margin-top:10px; display:flex; justify-content:flex-end; gap:8px;">
                        <button type="button" class="btn btn-primary btn-sm" data-save-jd="${escapeHtml(app.id)}">
                          Save Job Description
                        </button>
                      </div>
                    </div>`
                  : app.jobDescription
                  ? `<div class="jd-prose">${escapeHtml(app.jobDescription)}</div>`
                  : `<p class="tone-muted" style="font-size:14px;">No job description text saved yet. Click <strong>Edit JD Text</strong> to paste responsibilities and requirements.</p>`
              }
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// 4. Upcoming Events View
// ============================================================================

export function renderEventsView(state) {
  const nowMs = Date.now();
  const allEvents = extractEvents(state.applications, nowMs);

  const filter = state.eventFilter || 'upcoming';
  const filtered = allEvents.filter((ev) => {
    if (filter === 'urgent') return ev.urgency.isUrgent24h;
    if (filter === 'soon') return ev.urgency.isUrgent24h || ev.urgency.isSoon3d;
    if (filter === 'pending') return ev.round.status === 'Awaiting Result';
    if (filter === 'completed') return ev.urgency.level === 'completed';
    if (filter === 'upcoming') {
      return ev.round.status === 'Upcoming' || ev.round.status === 'Awaiting Result';
    }
    return true;
  });

  const tabs = [
    { id: 'upcoming', label: 'Upcoming & Pending' },
    { id: 'urgent', label: 'Urgent (< 24h)' },
    { id: 'soon', label: 'Within 3 Days' },
    { id: 'completed', label: 'Completed' },
    { id: 'all', label: 'All Rounds' },
  ];

  return `
    <div class="view-enter">
      <div class="page-header">
        <div>
          <h1 class="page-title">Upcoming Events &amp; Deadlines</h1>
          <p class="page-subtitle">Exams, interviews, and expected results with live countdowns and visual alerts.</p>
        </div>
      </div>

      <div class="toolbar">
        <div class="segmented-group" role="tablist" aria-label="Filter events">
          ${tabs
            .map(
              (t) => `
              <button
                type="button"
                role="tab"
                aria-selected="${filter === t.id ? 'true' : 'false'}"
                class="segmented-btn ${filter === t.id ? 'active' : ''}"
                data-event-filter="${t.id}"
              >
                ${escapeHtml(t.label)}
              </button>
            `
            )
            .join('')}
        </div>
      </div>

      <section class="surface-panel">
        ${
          filtered.length === 0
            ? `<div class="empty-state">
                <h3>No events in this view</h3>
                <p>Switch filter tabs or open any company application to schedule a new assessment or interview round.</p>
              </div>`
            : `<div class="list-rows" data-testid="events-list">
                ${filtered
                  .map((ev) => {
                    const { urgency, round } = ev;
                    return `
                      <div class="event-row level-${urgency.level}">
                        <div class="event-main">
                          <div class="event-heading">
                            ${urgency.isUrgent24h ? '<span class="urgent-dot" aria-label="Urgent within 24 hours"></span>' : ''}
                            <button type="button" class="company-link-btn" data-open-app="${escapeHtml(ev.applicationId)}">
                              ${escapeHtml(ev.company)} — ${escapeHtml(round.type)}
                            </button>
                          </div>
                          <div class="meta-line">
                            <span>${escapeHtml(ev.role)}</span>
                            <span class="meta-sep" aria-hidden="true">·</span>
                            <span class="tabular">${escapeHtml(formatDateTime(round.date))}</span>
                            <span class="meta-sep" aria-hidden="true">·</span>
                            <span class="status-text tone-${urgency.level}">${escapeHtml(urgency.label)}</span>
                          </div>
                          ${round.notes ? `<p class="event-notes">${escapeHtml(round.notes)}</p>` : ''}
                        </div>
                        <div class="event-right">
                          <span class="countdown-label tone-${urgency.level}">${escapeHtml(urgency.countdownText)}</span>
                          <div class="timeline-controls" style="margin-top:6px; justify-content:flex-end;">
                            <select
                              class="inline-status-select"
                              data-quick-round-status="${escapeHtml(ev.applicationId)}::${escapeHtml(round.id)}"
                              aria-label="Update status for ${escapeHtml(ev.company)} ${escapeHtml(round.type)}"
                            >
                              ${ROUND_STATUSES.map(
                                (st) =>
                                  `<option value="${escapeHtml(st)}" ${round.status === st ? 'selected' : ''}>${escapeHtml(st)}</option>`
                              ).join('')}
                            </select>
                            <button
                              type="button"
                              class="btn btn-secondary btn-sm"
                              data-open-app="${escapeHtml(ev.applicationId)}"
                            >
                              Open
                            </button>
                          </div>
                        </div>
                      </div>
                    `;
                  })
                  .join('')}
              </div>`
        }
      </section>
    </div>
  `;
}

// ============================================================================
// 5. Document Vault View (Resumes & JDs)
// ============================================================================

export function renderVaultView(state) {
  const filter = state.vaultFilter || 'all';
  const q = (state.vaultSearch || '').trim().toLowerCase();

  const appById = new Map(state.applications.map((a) => [a.id, a]));

  const rows = state.files
    .map((file) => ({
      ...file,
      app: appById.get(file.applicationId) || null,
    }))
    .filter((item) => {
      if (filter !== 'all' && item.kind !== filter) return false;
      if (!q) return true;
      const hay = `${item.name} ${item.app?.company || ''} ${item.app?.role || ''}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));

  const tabs = [
    { id: 'all', label: 'All PDFs' },
    { id: 'resume', label: 'Resumes' },
    { id: 'jd', label: 'Job Descriptions' },
  ];

  return `
    <div class="view-enter">
      <div class="page-header">
        <div>
          <h1 class="page-title">Document Vault</h1>
          <p class="page-subtitle">All submitted resumes and job description PDFs stored persistently in IndexedDB.</p>
        </div>
      </div>

      <div class="toolbar">
        <div class="search-wrap">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            id="vaultSearchInput"
            class="search-input"
            placeholder="Search by filename or company..."
            value="${escapeHtml(state.vaultSearch)}"
            aria-label="Search stored documents"
          />
        </div>

        <div class="segmented-group" role="tablist" aria-label="Filter document type">
          ${tabs
            .map(
              (t) => `
              <button
                type="button"
                role="tab"
                aria-selected="${filter === t.id ? 'true' : 'false'}"
                class="segmented-btn ${filter === t.id ? 'active' : ''}"
                data-vault-filter="${t.id}"
              >
                ${escapeHtml(t.label)}
              </button>
            `
            )
            .join('')}
        </div>
      </div>

      <section class="surface-panel">
        ${
          rows.length === 0
            ? `<div class="empty-state">
                <h3>No PDF documents stored</h3>
                <p>Open any application to upload the submitted resume PDF or official job description PDF.</p>
                <button type="button" class="btn btn-primary" data-nav="applications">Go to Applications</button>
              </div>`
            : `<div class="table-scroll">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Company &amp; Role</th>
                      <th>Type</th>
                      <th>Size</th>
                      <th class="cell-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows
                      .map(
                        (doc) => `
                        <tr>
                          <td>
                            <span class="doc-file-name">${escapeHtml(doc.name)}</span>
                          </td>
                          <td>
                            ${
                              doc.app
                                ? `<button type="button" class="company-link-btn" data-open-app="${escapeHtml(doc.app.id)}">
                                    ${escapeHtml(doc.app.company)}
                                  </button>
                                  <div class="table-role">${escapeHtml(doc.app.role)}</div>`
                                : '<span class="tone-muted">Unlinked</span>'
                            }
                          </td>
                          <td>${doc.kind === 'resume' ? 'Submitted Resume' : 'Job Description'}</td>
                          <td class="tabular">${escapeHtml(formatFileSize(doc.size))}</td>
                          <td class="cell-right">
                            <div class="row-actions">
                              <button
                                type="button"
                                class="btn btn-secondary btn-sm"
                                data-view-pdf="${escapeHtml(doc.id)}"
                                aria-label="View ${escapeHtml(doc.name)}"
                              >
                                View PDF
                              </button>
                              <button
                                type="button"
                                class="btn btn-ghost btn-sm"
                                data-download-pdf="${escapeHtml(doc.id)}"
                                aria-label="Download ${escapeHtml(doc.name)}"
                              >
                                Download
                              </button>
                            </div>
                          </td>
                        </tr>
                      `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>`
        }
      </section>
    </div>
  `;
}

// ============================================================================
// 6. AI Placement Assistant View
// ============================================================================

export function renderAssistantView(state) {
  const updateCandidate =
    state.applications.find((a) => a.status === 'In Progress' || a.status === 'Applied') ||
    state.applications.find((a) => a.status !== 'Interviewing') ||
    state.applications[0];
  const targetStatus =
    updateCandidate && updateCandidate.status === 'Interviewing' ? 'Offer' : 'Interviewing';
  const sampleUpdatePrompt = updateCandidate
    ? `Update ${updateCandidate.company} status to ${targetStatus}`
    : 'Analyze my placement';

  return `
    <div class="view-enter">
      <div class="page-header">
        <div>
          <h1 class="page-title">AI Placement Assistant</h1>
          <p class="page-subtitle">Analyzes your actual saved IndexedDB applications and upcoming events. Never invents data.</p>
        </div>
        <button
          type="button"
          class="btn btn-primary"
          data-action="analyze-placement"
          ${state.aiLoading ? 'disabled' : ''}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4L12 3z" />
          </svg>
          <span>Analyze My Placement</span>
        </button>
      </div>

      <div class="assistant-layout">
        <section class="surface-panel" aria-label="Placement analysis conversation">
          <form id="assistantPromptForm" class="assistant-prompt-bar">
            <label for="assistantPromptInput" class="visually-hidden-input">Ask placement assistant</label>
            <input
              type="text"
              id="assistantPromptInput"
              class="assistant-input"
              placeholder="Ask about urgent exams, pending results, or request an application status update..."
              ${state.aiLoading ? 'disabled' : ''}
            />
            <button type="submit" class="btn btn-primary" ${state.aiLoading ? 'disabled' : ''}>
              Ask Assistant
            </button>
          </form>

          <div class="quick-prompts">
            <button type="button" class="quick-prompt-btn" data-quick-prompt="Analyze my placement progress and tell me what to prioritize today.">
              Prioritize today
            </button>
            <button type="button" class="quick-prompt-btn" data-quick-prompt="Which upcoming exams or interviews do I have in the next 3 days?">
              Next 3 days
            </button>
            <button type="button" class="quick-prompt-btn" data-quick-prompt="Summarize my pending results and offers.">
              Pending results &amp; offers
            </button>
            <button type="button" class="quick-prompt-btn" data-quick-prompt="${escapeHtml(sampleUpdatePrompt)}">
              ${escapeHtml(sampleUpdatePrompt)}
            </button>
          </div>

          <div class="assistant-feed" data-testid="assistant-feed">
            ${
              state.aiLoading
                ? `<div class="loading-pulse">
                    <span class="spinner" aria-hidden="true"></span>
                    <span>Inspecting your saved applications and upcoming events...</span>
                  </div>`
                : ''
            }

            ${
              state.aiMessages.length === 0 && !state.aiLoading
                ? `<div class="empty-state">
                    <h3>Ready to review your placement pipeline</h3>
                    <p>Click <strong>Analyze My Placement</strong> to inspect your real saved records via <code>getApplications()</code> and <code>getUpcomingEvents()</code>.</p>
                    <button type="button" class="btn btn-primary" data-action="analyze-placement">
                      Analyze My Placement
                    </button>
                  </div>`
                : state.aiMessages
                    .map((msg) => {
                      if (msg.role === 'user') {
                        return `
                          <article class="chat-entry">
                            <div class="chat-entry-header">
                              <span class="chat-role">You</span>
                              <span class="chat-meta tabular">${escapeHtml(msg.timestamp)}</span>
                            </div>
                            <p>${escapeHtml(msg.text)}</p>
                          </article>
                        `;
                      }

                      return `
                        <article class="chat-entry">
                          <div class="chat-entry-header">
                            <span class="chat-role assistant">CareerVault AI</span>
                            <span class="chat-meta">${escapeHtml(msg.model || 'Assistant')} · <span class="tabular">${escapeHtml(msg.timestamp)}</span></span>
                          </div>
                          ${
                            msg.notice
                              ? `<div class="assistant-notice">${escapeHtml(msg.notice)}</div>`
                              : ''
                          }
                          <div class="markdown-body">${renderMarkdownSafe(msg.markdown)}</div>
                          ${
                            Array.isArray(msg.pendingProposals) && msg.pendingProposals.length > 0
                              ? msg.pendingProposals
                                  .map((prop) => renderProposalCard(msg.id, prop))
                                  .join('')
                              : ''
                          }
                          ${
                            Array.isArray(msg.toolsUsed) && msg.toolsUsed.length > 0
                              ? `<p class="assistant-tools-line">Tools called: ${escapeHtml(msg.toolsUsed.join('  ·  '))}</p>`
                              : ''
                          }
                        </article>
                      `;
                    })
                    .join('')
            }
          </div>
        </section>

        <aside class="surface-panel" aria-labelledby="toolsGuideHeading">
          <div class="panel-header">
            <h2 class="panel-title" id="toolsGuideHeading">Agent Tools &amp; Guardrails</h2>
          </div>
          <div class="panel-body" style="display:flex; flex-direction:column; gap:14px; font-size:13.5px; color:var(--ink-secondary);">
            <div>
              <strong style="color:var(--ink-primary); font-family:var(--font-mono); font-size:12.5px;">getApplications()</strong>
              <p style="margin-top:2px;">Reads your saved companies, statuses, packages, notes, and rounds directly from IndexedDB.</p>
            </div>
            <div>
              <strong style="color:var(--ink-primary); font-family:var(--font-mono); font-size:12.5px;">getUpcomingEvents()</strong>
              <p style="margin-top:2px;">Calculates real countdowns and identifies urgent events within 24 hours and 3 days.</p>
            </div>
            <div>
              <strong style="color:var(--ink-primary); font-family:var(--font-mono); font-size:12.5px;">updateApplication()</strong>
              <p style="margin-top:2px;">Proposes record changes and always requires your explicit click on <strong>Confirm Update</strong> before saving.</p>
            </div>
            <div style="padding-top:12px; border-top:1px solid var(--border-subtle); font-size:12.5px; color:var(--ink-muted);">
              Engine status: <strong style="color:var(--ink-primary);">${
                state.geminiAvailable ? 'Gemini API Ready' : 'Local Demo Mode Active'
              }</strong>
            </div>
          </div>
        </aside>
      </div>
    </div>
  `;
}

function renderProposalCard(messageId, prop) {
  const fields = Object.keys(prop.updates || {});
  const boxClass =
    prop.state === 'confirmed'
      ? 'proposal-box confirmed'
      : prop.state === 'cancelled'
      ? 'proposal-box cancelled'
      : 'proposal-box';

  return `
    <div class="${boxClass}" data-testid="proposal-card">
      <p class="proposal-title">
        ${
          prop.state === 'confirmed'
            ? `Update Applied — ${escapeHtml(prop.company)}`
            : prop.state === 'cancelled'
            ? `Update Cancelled — ${escapeHtml(prop.company)}`
            : `Confirmation Required — Update ${escapeHtml(prop.company)}`
        }
      </p>
      <p class="proposal-reason">${escapeHtml(prop.reason)}</p>
      <div class="proposal-diff">
        ${fields
          .map(
            (key) => `
            <div>
              <strong>${escapeHtml(key)}:</strong>
              <span class="tone-muted">${escapeHtml(prop.currentValues?.[key] ?? '—')}</span>
              <span aria-hidden="true"> → </span>
              <strong class="tone-scheduled">${escapeHtml(prop.updates[key])}</strong>
            </div>
          `
          )
          .join('')}
      </div>
      ${
        prop.state === 'pending'
          ? `<div class="proposal-actions">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                data-confirm-proposal="${escapeHtml(messageId)}::${escapeHtml(prop.id)}"
              >
                Confirm Update
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                data-cancel-proposal="${escapeHtml(messageId)}::${escapeHtml(prop.id)}"
              >
                Cancel
              </button>
            </div>`
          : ''
      }
    </div>
  `;
}
