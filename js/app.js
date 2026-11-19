/**
 * CareerVault AI — Main Application Controller
 * Coordinates IndexedDB hydration, routing, modal forms, PDF preview/download, and AI Assistant.
 */

import { seedSampleDataIfNeeded, loadSampleData } from './database.js';
import {
  listApplications,
  listAllDocuments,
  createApplication,
  editApplication,
  removeApplication,
  addRound,
  updateRound,
  deleteRound,
  uploadApplicationPdf,
  removeApplicationPdf,
  getStoredPdfRecord,
  downloadStoredPdf,
} from './applications.js';
import { computeDashboardMetrics } from './logic.js';
import { checkGeminiAvailability } from './gemini.js';
import { runPlacementAssistant, confirmAgentProposal } from './agent.js';
import {
  renderDashboardView,
  renderApplicationsView,
  renderApplicationDetailView,
  renderEventsView,
  renderVaultView,
  renderAssistantView,
  escapeHtml,
  formatFileSize,
} from './ui.js';

const state = {
  view: 'dashboard', // 'dashboard' | 'applications' | 'detail' | 'events' | 'vault' | 'assistant'
  selectedAppId: null,
  applications: [],
  files: [],

  // Filters & view state
  appSearch: '',
  appStatusFilter: 'All',
  appSortBy: 'recent',
  eventFilter: 'upcoming',
  vaultFilter: 'all',
  vaultSearch: '',
  editingJd: false,

  // AI Assistant state
  geminiAvailable: false,
  aiLoading: false,
  aiMessages: [],

  // Active PDF object URL for cleanup
  activePdfUrl: null,
  activePdfFileId: null,

  // Pending confirm modal action
  confirmCallback: null,
};

const dom = {
  sidebar: document.getElementById('sidebar'),
  sidebarBackdrop: document.getElementById('sidebarBackdrop'),
  openSidebarBtn: document.getElementById('openSidebarBtn'),
  closeSidebarBtn: document.getElementById('closeSidebarBtn'),
  sidebarNav: document.getElementById('sidebarNav'),
  navAppsCount: document.getElementById('navAppsCount'),
  navUrgentWrap: document.getElementById('navUrgentWrap'),
  navUrgentCount: document.getElementById('navUrgentCount'),
  sidebarStorageMeta: document.getElementById('sidebarStorageMeta'),
  topBreadcrumb: document.getElementById('topBreadcrumb'),
  topAddAppBtn: document.getElementById('topAddAppBtn'),
  mainContent: document.getElementById('mainContent'),
  toastRegion: document.getElementById('toastRegion'),

  // Modals
  appModalOverlay: document.getElementById('appModalOverlay'),
  appModalTitle: document.getElementById('appModalTitle'),
  applicationForm: document.getElementById('applicationForm'),
  appFormFileUploads: document.getElementById('appFormFileUploads'),
  appFormSubmitBtn: document.getElementById('appFormSubmitBtn'),

  roundModalOverlay: document.getElementById('roundModalOverlay'),
  roundModalTitle: document.getElementById('roundModalTitle'),
  roundForm: document.getElementById('roundForm'),

  pdfModalOverlay: document.getElementById('pdfModalOverlay'),
  pdfModalTitle: document.getElementById('pdfModalTitle'),
  pdfModalMeta: document.getElementById('pdfModalMeta'),
  pdfModalDownloadBtn: document.getElementById('pdfModalDownloadBtn'),
  pdfPreviewFrame: document.getElementById('pdfPreviewFrame'),

  confirmModalOverlay: document.getElementById('confirmModalOverlay'),
  confirmModalTitle: document.getElementById('confirmModalTitle'),
  confirmModalMessage: document.getElementById('confirmModalMessage'),
  confirmModalActionBtn: document.getElementById('confirmModalActionBtn'),
};

// ============================================================================
// Toast Notifications
// ============================================================================

function showToast(message, isError = false) {
  const el = document.createElement('div');
  el.className = `toast ${isError ? 'toast-error' : ''}`;
  el.textContent = message;
  dom.toastRegion.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3400);
}

// ============================================================================
// Data Hydration & Render Cycle
// ============================================================================

async function refreshData() {
  const [applications, files] = await Promise.all([listApplications(), listAllDocuments()]);
  state.applications = applications;
  state.files = files;
  renderApp();
}

function updateSidebarAndHeader() {
  const metrics = computeDashboardMetrics(state.applications, Date.now());
  dom.navAppsCount.textContent = String(metrics.totalApplications);

  if (metrics.urgentCount24h > 0) {
    dom.navUrgentWrap.hidden = false;
    dom.navUrgentCount.textContent = String(metrics.urgentCount24h);
  } else {
    dom.navUrgentWrap.hidden = true;
  }

  dom.sidebarStorageMeta.textContent = `${state.applications.length} apps · ${state.files.length} PDF${
    state.files.length === 1 ? '' : 's'
  } stored offline`;

  // Active nav highlight
  const activeNavKey = state.view === 'detail' ? 'applications' : state.view;
  dom.sidebarNav.querySelectorAll('.nav-item').forEach((btn) => {
    const isActive = btn.dataset.nav === activeNavKey;
    btn.classList.toggle('active', isActive);
    if (isActive) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  // Top breadcrumb
  const labels = {
    dashboard: 'Dashboard',
    applications: 'Applications',
    events: 'Upcoming Events',
    vault: 'Document Vault',
    assistant: 'AI Assistant',
  };

  if (state.view === 'detail') {
    const app = state.applications.find((a) => a.id === state.selectedAppId);
    dom.topBreadcrumb.innerHTML = `
      <span class="breadcrumb-root">CareerVault</span>
      <span class="breadcrumb-sep" aria-hidden="true">/</span>
      <button type="button" class="breadcrumb-link" data-nav="applications">Applications</button>
      <span class="breadcrumb-sep" aria-hidden="true">/</span>
      <span class="breadcrumb-current">${escapeHtml(app?.company || 'Details')}</span>
    `;
  } else {
    dom.topBreadcrumb.innerHTML = `
      <span class="breadcrumb-root">CareerVault</span>
      <span class="breadcrumb-sep" aria-hidden="true">/</span>
      <span class="breadcrumb-current">${escapeHtml(labels[state.view] || 'Dashboard')}</span>
    `;
  }
}

function renderApp() {
  updateSidebarAndHeader();

  let html = '';
  switch (state.view) {
    case 'applications':
      html = renderApplicationsView(state);
      break;
    case 'detail':
      html = renderApplicationDetailView(state);
      break;
    case 'events':
      html = renderEventsView(state);
      break;
    case 'vault':
      html = renderVaultView(state);
      break;
    case 'assistant':
      html = renderAssistantView(state);
      break;
    default:
      html = renderDashboardView(state);
      break;
  }

  dom.mainContent.innerHTML = html;
}

function navigateTo(view, selectedAppId = null) {
  state.view = view;
  if (view === 'detail') {
    state.selectedAppId = selectedAppId;
    state.editingJd = false;
  } else {
    state.selectedAppId = null;
    state.editingJd = false;
  }
  closeMobileSidebar();
  renderApp();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ============================================================================
// Mobile Sidebar Drawer
// ============================================================================

function openMobileSidebar() {
  dom.sidebar.classList.add('open');
  dom.sidebarBackdrop.hidden = false;
}

function closeMobileSidebar() {
  dom.sidebar.classList.remove('open');
  dom.sidebarBackdrop.hidden = true;
}

// ============================================================================
// Modals: Application, Round, PDF Preview, Confirm Delete
// ============================================================================

function closeModal(overlayId) {
  const overlay = document.getElementById(overlayId);
  if (!overlay) return;
  overlay.hidden = true;

  if (overlayId === 'pdfModalOverlay' && state.activePdfUrl) {
    URL.revokeObjectURL(state.activePdfUrl);
    state.activePdfUrl = null;
    state.activePdfFileId = null;
    dom.pdfPreviewFrame.src = 'about:blank';
  }
}

function clearFormErrors(formEl) {
  formEl.querySelectorAll('.field-error').forEach((el) => {
    el.textContent = '';
  });
  formEl.querySelectorAll('.input-invalid').forEach((el) => {
    el.classList.remove('input-invalid');
  });
}

function openApplicationModal(existingApp = null) {
  clearFormErrors(dom.applicationForm);
  dom.applicationForm.reset();

  if (existingApp) {
    dom.appModalTitle.textContent = `Edit ${existingApp.company}`;
    dom.appFormSubmitBtn.textContent = 'Save Changes';
    dom.appFormFileUploads.hidden = true;
    document.getElementById('appFormId').value = existingApp.id;
    document.getElementById('appCompany').value = existingApp.company || '';
    document.getElementById('appRole').value = existingApp.role || '';
    document.getElementById('appLocation').value = existingApp.location || '';
    document.getElementById('appPackage').value = existingApp.package || '';
    document.getElementById('appDate').value = existingApp.applicationDate || '';
    document.getElementById('appStatus').value = existingApp.status || 'Applied';
    document.getElementById('appJobLink').value = existingApp.jobLink || '';
    document.getElementById('appJobDescription').value = existingApp.jobDescription || '';
    document.getElementById('appNotes').value = existingApp.notes || '';
  } else {
    dom.appModalTitle.textContent = 'Add Application';
    dom.appFormSubmitBtn.textContent = 'Save Application';
    dom.appFormFileUploads.hidden = false;
    document.getElementById('appFormId').value = '';
    document.getElementById('appDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('appStatus').value = 'Applied';
  }

  dom.appModalOverlay.hidden = false;
  document.getElementById('appCompany').focus();
}

function openRoundModal(applicationId, existingRound = null) {
  clearFormErrors(dom.roundForm);
  dom.roundForm.reset();

  document.getElementById('roundAppId').value = applicationId;

  if (existingRound) {
    dom.roundModalTitle.textContent = 'Edit Recruitment Round';
    document.getElementById('roundId').value = existingRound.id;
    document.getElementById('roundType').value = existingRound.type || 'Online Assessment';
    document.getElementById('roundDate').value = (existingRound.date || '').slice(0, 16);
    document.getElementById('roundStatus').value = existingRound.status || 'Upcoming';
    document.getElementById('roundNotes').value = existingRound.notes || '';
  } else {
    dom.roundModalTitle.textContent = 'Add Recruitment Round';
    document.getElementById('roundId').value = '';
    // Default date to tomorrow at 10:00 local time
    const tomorrow = new Date(Date.now() + 24 * 3600000);
    const pad = (n) => String(n).padStart(2, '0');
    document.getElementById('roundDate').value = `${tomorrow.getFullYear()}-${pad(
      tomorrow.getMonth() + 1
    )}-${pad(tomorrow.getDate())}T10:00`;
    document.getElementById('roundStatus').value = 'Upcoming';
  }

  dom.roundModalOverlay.hidden = false;
  document.getElementById('roundType').focus();
}

async function openPdfPreview(fileId) {
  const record = await getStoredPdfRecord(fileId);
  if (!record || !record.blob) {
    showToast('Could not load PDF from IndexedDB.', true);
    return;
  }

  if (state.activePdfUrl) {
    URL.revokeObjectURL(state.activePdfUrl);
  }

  const blob =
    record.blob instanceof Blob
      ? record.blob
      : new Blob([record.blob], { type: 'application/pdf' });

  const url = URL.createObjectURL(blob);
  state.activePdfUrl = url;
  state.activePdfFileId = fileId;

  dom.pdfModalTitle.textContent = record.name || 'PDF Preview';
  dom.pdfModalMeta.textContent = `${
    record.kind === 'resume' ? 'Submitted Resume' : 'Job Description'
  } · ${formatFileSize(record.size)}`;
  dom.pdfPreviewFrame.src = url;
  dom.pdfModalOverlay.hidden = false;
}

function openConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm }) {
  dom.confirmModalTitle.textContent = title;
  dom.confirmModalMessage.textContent = message;
  dom.confirmModalActionBtn.textContent = confirmLabel;
  state.confirmCallback = onConfirm;
  dom.confirmModalOverlay.hidden = false;
  dom.confirmModalActionBtn.focus();
}

// ============================================================================
// AI Placement Assistant Actions
// ============================================================================

async function triggerAssistantAnalysis(promptText) {
  if (state.aiLoading) return;

  if (state.view !== 'assistant') {
    state.view = 'assistant';
    state.selectedAppId = null;
  }

  const nowTime = new Date().toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  state.aiMessages.push({
    id: `msg-u-${Date.now()}`,
    role: 'user',
    text: promptText,
    timestamp: nowTime,
  });

  state.aiLoading = true;
  renderApp();

  try {
    const result = await runPlacementAssistant(promptText);
    state.aiMessages.push({
      id: `msg-a-${Date.now()}`,
      role: 'assistant',
      markdown: result.markdown,
      model: result.model,
      notice: result.notice,
      toolsUsed: result.toolsUsed,
      pendingProposals: result.pendingProposals,
      timestamp: new Date().toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }),
    });
  } catch (err) {
    showToast('AI analysis encountered an error.', true);
    state.aiMessages.push({
      id: `msg-e-${Date.now()}`,
      role: 'assistant',
      markdown: 'Unable to complete placement analysis right now. Please try again.',
      model: 'System',
      notice: err instanceof Error ? err.message : null,
      toolsUsed: [],
      pendingProposals: [],
      timestamp: nowTime,
    });
  } finally {
    state.aiLoading = false;
    renderApp();
    const lastEntry = dom.mainContent.querySelector('.assistant-feed .chat-entry:last-child');
    if (lastEntry) {
      lastEntry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

// ============================================================================
// Global Event Listeners
// ============================================================================

function bindEvents() {
  // Mobile sidebar toggles
  dom.openSidebarBtn.addEventListener('click', openMobileSidebar);
  dom.closeSidebarBtn.addEventListener('click', closeMobileSidebar);
  dom.sidebarBackdrop.addEventListener('click', closeMobileSidebar);

  // Top bar Add Application
  dom.topAddAppBtn.addEventListener('click', () => openApplicationModal(null));

  // Modal close buttons & backdrop clicks
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-close-modal]');
    if (closeBtn) {
      closeModal(closeBtn.dataset.closeModal);
      return;
    }

    if (e.target.classList.contains('modal-overlay')) {
      closeModal(e.target.id);
    }
  });

  // Escape key closes open modal
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    ['appModalOverlay', 'roundModalOverlay', 'pdfModalOverlay', 'confirmModalOverlay'].forEach(
      (id) => {
        const el = document.getElementById(id);
        if (el && !el.hidden) closeModal(id);
      }
    );
  });

  // Confirm modal action
  dom.confirmModalActionBtn.addEventListener('click', async () => {
    const cb = state.confirmCallback;
    state.confirmCallback = null;
    closeModal('confirmModalOverlay');
    if (typeof cb === 'function') {
      await cb();
    }
  });

  // PDF Preview Modal download button
  dom.pdfModalDownloadBtn.addEventListener('click', async () => {
    if (!state.activePdfFileId) return;
    const res = await downloadStoredPdf(state.activePdfFileId);
    if (!res.ok) showToast(res.error || 'Download failed.', true);
    else showToast(`Downloaded ${res.name}`);
  });

  // Application Form Submit
  dom.applicationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(dom.applicationForm);

    const formData = new FormData(dom.applicationForm);
    const id = String(formData.get('id') || '').trim();
    const payload = {
      company: formData.get('company'),
      role: formData.get('role'),
      location: formData.get('location'),
      package: formData.get('package'),
      applicationDate: formData.get('applicationDate'),
      status: formData.get('status'),
      jobLink: formData.get('jobLink'),
      jobDescription: formData.get('jobDescription'),
      notes: formData.get('notes'),
    };

    const resumeInput = document.getElementById('appResumeFile');
    const jdInput = document.getElementById('appJdFile');
    const resumeFile = resumeInput?.files?.[0] || null;
    const jdFile = jdInput?.files?.[0] || null;

    const result = id
      ? await editApplication(id, payload)
      : await createApplication(payload, { resumeFile, jdFile });

    if (!result.ok) {
      Object.entries(result.errors || {}).forEach(([field, msg]) => {
        const errEl = document.getElementById(`err-${field}`);
        if (errEl) errEl.textContent = msg;
        const inputEl = dom.applicationForm.querySelector(`[name="${field}"]`);
        if (inputEl) inputEl.classList.add('input-invalid');
      });
      return;
    }

    closeModal('appModalOverlay');
    showToast(id ? `Updated ${result.application.company}` : `Added ${result.application.company}`);
    await refreshData();
  });

  // Round Form Submit
  dom.roundForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(dom.roundForm);

    const formData = new FormData(dom.roundForm);
    const appId = String(formData.get('applicationId') || '');
    const roundId = String(formData.get('roundId') || '');
    const payload = {
      type: formData.get('type'),
      date: formData.get('date'),
      status: formData.get('status'),
      notes: formData.get('notes'),
    };

    const result = roundId
      ? await updateRound(appId, roundId, payload)
      : await addRound(appId, payload);

    if (!result.ok) {
      Object.entries(result.errors || {}).forEach(([field, msg]) => {
        const errEl = document.getElementById(`err-round-${field}`);
        if (errEl) errEl.textContent = msg;
        const inputEl = dom.roundForm.querySelector(`[name="${field}"]`);
        if (inputEl) inputEl.classList.add('input-invalid');
      });
      return;
    }

    closeModal('roundModalOverlay');
    showToast(roundId ? 'Recruitment round updated' : 'Recruitment round added');
    await refreshData();
  });

  // Delegated clicks across Sidebar, Topbar, and Main Content
  document.addEventListener('click', async (e) => {
    const navEl = e.target.closest('[data-nav]');
    if (navEl) {
      e.preventDefault();
      navigateTo(navEl.dataset.nav);
      return;
    }

    const openAppEl = e.target.closest('[data-open-app]');
    if (openAppEl) {
      navigateTo('detail', openAppEl.dataset.openApp);
      return;
    }

    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const action = actionEl.dataset.action;
      if (action === 'open-add-app') {
        openApplicationModal(null);
      } else if (action === 'load-samples') {
        await loadSampleData();
        showToast('Sample applications loaded');
        await refreshData();
      } else if (action === 'clear-app-filters') {
        state.appSearch = '';
        state.appStatusFilter = 'All';
        renderApp();
      } else if (action === 'analyze-placement') {
        await triggerAssistantAnalysis(
          'Analyze my placement progress, highlight urgent upcoming exams or interviews, summarize pending results, and suggest my top priorities today.'
        );
      }
      return;
    }

    const statusTab = e.target.closest('[data-app-status-filter]');
    if (statusTab) {
      state.appStatusFilter = statusTab.dataset.appStatusFilter;
      renderApp();
      return;
    }

    const eventTab = e.target.closest('[data-event-filter]');
    if (eventTab) {
      state.eventFilter = eventTab.dataset.eventFilter;
      renderApp();
      return;
    }

    const vaultTab = e.target.closest('[data-vault-filter]');
    if (vaultTab) {
      state.vaultFilter = vaultTab.dataset.vaultFilter;
      renderApp();
      return;
    }

    const editAppBtn = e.target.closest('[data-edit-app]');
    if (editAppBtn) {
      const app = state.applications.find((a) => a.id === editAppBtn.dataset.editApp);
      if (app) openApplicationModal(app);
      return;
    }

    const deleteAppBtn = e.target.closest('[data-delete-app]');
    if (deleteAppBtn) {
      const app = state.applications.find((a) => a.id === deleteAppBtn.dataset.deleteApp);
      if (!app) return;
      openConfirmDialog({
        title: `Delete ${app.company}?`,
        message: `This permanently deletes the application for ${app.company} (${app.role}), along with all recruitment rounds and uploaded PDFs.`,
        confirmLabel: 'Delete Application',
        onConfirm: async () => {
          await removeApplication(app.id);
          if (state.selectedAppId === app.id) {
            state.view = 'applications';
            state.selectedAppId = null;
          }
          showToast(`Deleted ${app.company}`);
          await refreshData();
        },
      });
      return;
    }

    const addRoundBtn = e.target.closest('[data-open-add-round]');
    if (addRoundBtn) {
      openRoundModal(addRoundBtn.dataset.openAddRound, null);
      return;
    }

    const editRoundBtn = e.target.closest('[data-edit-round]');
    if (editRoundBtn) {
      const [appId, roundId] = editRoundBtn.dataset.editRound.split('::');
      const app = state.applications.find((a) => a.id === appId);
      const round = app?.rounds?.find((r) => r.id === roundId);
      if (round) openRoundModal(appId, round);
      return;
    }

    const deleteRoundBtn = e.target.closest('[data-delete-round]');
    if (deleteRoundBtn) {
      const [appId, roundId] = deleteRoundBtn.dataset.deleteRound.split('::');
      const app = state.applications.find((a) => a.id === appId);
      const round = app?.rounds?.find((r) => r.id === roundId);
      if (!round) return;
      openConfirmDialog({
        title: `Delete ${round.type}?`,
        message: `Remove "${round.type}" from ${app.company}’s recruitment timeline?`,
        confirmLabel: 'Delete Round',
        onConfirm: async () => {
          await deleteRound(appId, roundId);
          showToast(`Removed ${round.type}`);
          await refreshData();
        },
      });
      return;
    }

    const viewPdfBtn = e.target.closest('[data-view-pdf]');
    if (viewPdfBtn) {
      await openPdfPreview(viewPdfBtn.dataset.viewPdf);
      return;
    }

    const downloadPdfBtn = e.target.closest('[data-download-pdf]');
    if (downloadPdfBtn) {
      const res = await downloadStoredPdf(downloadPdfBtn.dataset.downloadPdf);
      if (!res.ok) showToast(res.error || 'Download failed.', true);
      else showToast(`Downloaded ${res.name}`);
      return;
    }

    const removePdfBtn = e.target.closest('[data-remove-pdf]');
    if (removePdfBtn) {
      const [appId, kind] = removePdfBtn.dataset.removePdf.split('::');
      openConfirmDialog({
        title: `Remove ${kind === 'resume' ? 'Resume' : 'JD'} PDF?`,
        message: 'This deletes the stored PDF from your browser IndexedDB vault.',
        confirmLabel: 'Remove PDF',
        onConfirm: async () => {
          await removeApplicationPdf(appId, kind);
          showToast('PDF removed from vault');
          await refreshData();
        },
      });
      return;
    }

    const toggleJdBtn = e.target.closest('[data-toggle-jd-edit]');
    if (toggleJdBtn) {
      state.editingJd = !state.editingJd;
      renderApp();
      return;
    }

    const saveJdBtn = e.target.closest('[data-save-jd]');
    if (saveJdBtn) {
      const appId = saveJdBtn.dataset.saveJd;
      const textarea = document.getElementById('detailJdTextarea');
      if (!textarea) return;
      await editApplication(appId, { jobDescription: textarea.value });
      state.editingJd = false;
      showToast('Job description saved');
      await refreshData();
      return;
    }

    const saveNotesBtn = e.target.closest('[data-save-notes]');
    if (saveNotesBtn) {
      const appId = saveNotesBtn.dataset.saveNotes;
      const textarea = document.getElementById('detailNotesTextarea');
      if (!textarea) return;
      await editApplication(appId, { notes: textarea.value });
      showToast('Notes saved');
      await refreshData();
      return;
    }

    const quickPromptBtn = e.target.closest('[data-quick-prompt]');
    if (quickPromptBtn) {
      await triggerAssistantAnalysis(quickPromptBtn.dataset.quickPrompt);
      return;
    }

    const confirmPropBtn = e.target.closest('[data-confirm-proposal]');
    if (confirmPropBtn) {
      const [msgId, propId] = confirmPropBtn.dataset.confirmProposal.split('::');
      const msg = state.aiMessages.find((m) => m.id === msgId);
      const prop = msg?.pendingProposals?.find((p) => p.id === propId);
      if (!prop || prop.state !== 'pending') return;

      const res = await confirmAgentProposal(prop);
      if (res.ok) {
        prop.state = 'confirmed';
        showToast(`Confirmed update for ${prop.company}`);
        await refreshData();
      } else {
        showToast('Could not apply update.', true);
      }
      return;
    }

    const cancelPropBtn = e.target.closest('[data-cancel-proposal]');
    if (cancelPropBtn) {
      const [msgId, propId] = cancelPropBtn.dataset.cancelProposal.split('::');
      const msg = state.aiMessages.find((m) => m.id === msgId);
      const prop = msg?.pendingProposals?.find((p) => p.id === propId);
      if (!prop || prop.state !== 'pending') return;
      prop.state = 'cancelled';
      showToast('Proposed update cancelled');
      renderApp();
    }
  });

  // Delegated input & change events inside mainContent
  dom.mainContent.addEventListener('input', (e) => {
    if (e.target.id === 'applicationsSearchInput') {
      state.appSearch = e.target.value;
      const cursor = e.target.selectionStart;
      renderApp();
      const nextInput = document.getElementById('applicationsSearchInput');
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(cursor, cursor);
      }
    } else if (e.target.id === 'vaultSearchInput') {
      state.vaultSearch = e.target.value;
      const cursor = e.target.selectionStart;
      renderApp();
      const nextInput = document.getElementById('vaultSearchInput');
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(cursor, cursor);
      }
    }
  });

  dom.mainContent.addEventListener('change', async (e) => {
    const target = e.target;

    if (target.id === 'applicationsSortSelect') {
      state.appSortBy = target.value;
      renderApp();
      return;
    }

    if (target.dataset.quickAppStatus) {
      const appId = target.dataset.quickAppStatus;
      const res = await editApplication(appId, { status: target.value });
      if (res.ok) {
        showToast(`Status updated to ${target.value}`);
        await refreshData();
      }
      return;
    }

    if (target.dataset.quickRoundStatus) {
      const [appId, roundId] = target.dataset.quickRoundStatus.split('::');
      const res = await updateRound(appId, roundId, { status: target.value });
      if (res.ok) {
        showToast(`Round marked ${target.value}`);
        await refreshData();
      }
      return;
    }

    if (target.dataset.uploadPdf) {
      const [appId, kind] = target.dataset.uploadPdf.split('::');
      const file = target.files?.[0];
      if (!file) return;
      const res = await uploadApplicationPdf(appId, kind, file);
      if (!res.ok) {
        showToast(res.error || 'Invalid PDF file.', true);
      } else {
        showToast(`${kind === 'resume' ? 'Resume' : 'JD'} PDF saved to IndexedDB`);
        await refreshData();
      }
    }
  });

  // Delegated submit for AI assistant prompt form
  dom.mainContent.addEventListener('submit', async (e) => {
    if (e.target.id === 'assistantPromptForm') {
      e.preventDefault();
      const input = document.getElementById('assistantPromptInput');
      const text = input?.value?.trim() || '';
      if (!text) return;
      input.value = '';
      await triggerAssistantAnalysis(text);
    }
  });
}

// ============================================================================
// Bootstrap
// ============================================================================

async function init() {
  bindEvents();
  try {
    await seedSampleDataIfNeeded();
    const health = await checkGeminiAvailability();
    state.geminiAvailable = health.available;
    await refreshData();
  } catch (err) {
    console.error('Initialization failed:', err);
    dom.mainContent.innerHTML = `
      <div class="surface-panel">
        <div class="empty-state">
          <h3>Unable to initialize local storage</h3>
          <p>${escapeHtml(err instanceof Error ? err.message : 'IndexedDB is unavailable.')}</p>
        </div>
      </div>
    `;
  }
}

init();
