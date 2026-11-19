/**
 * Application, Recruitment Round, and Document Vault CRUD operations.
 */

import {
  getAllApplications,
  getApplicationById,
  putApplication,
  deleteApplicationRecord,
  saveFileRecord,
  getFileRecord,
  deleteFileRecord,
  getAllFiles,
} from './database.js';
import {
  validateApplicationInput,
  validateRoundInput,
  validatePdfFile,
} from './logic.js';

function createId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 10)}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function listApplications() {
  return getAllApplications();
}

export async function fetchApplication(id) {
  return getApplicationById(id);
}

export async function listAllDocuments() {
  return getAllFiles();
}

/**
 * Create a new job application (optionally storing Resume & JD PDFs in IndexedDB).
 */
export async function createApplication(formData, { resumeFile = null, jdFile = null } = {}) {
  const validation = validateApplicationInput(formData);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  if (resumeFile) {
    const check = validatePdfFile(resumeFile);
    if (!check.valid) return { ok: false, errors: { resumeFile: check.error } };
  }

  if (jdFile) {
    const check = validatePdfFile(jdFile);
    if (!check.valid) return { ok: false, errors: { jdFile: check.error } };
  }

  const now = Date.now();
  const id = createId('app');

  let resumeFileId = null;
  let resumeFileName = null;
  let jdFileId = null;
  let jdFileName = null;

  if (resumeFile) {
    resumeFileId = createId('file-res');
    resumeFileName = resumeFile.name;
    await saveFileRecord({
      id: resumeFileId,
      applicationId: id,
      kind: 'resume',
      name: resumeFile.name,
      mimeType: 'application/pdf',
      size: resumeFile.size,
      uploadedAt: new Date(now).toISOString(),
      blob: resumeFile,
    });
  }

  if (jdFile) {
    jdFileId = createId('file-jd');
    jdFileName = jdFile.name;
    await saveFileRecord({
      id: jdFileId,
      applicationId: id,
      kind: 'jd',
      name: jdFile.name,
      mimeType: 'application/pdf',
      size: jdFile.size,
      uploadedAt: new Date(now).toISOString(),
      blob: jdFile,
    });
  }

  const record = {
    id,
    company: formData.company.trim(),
    role: formData.role.trim(),
    location: (formData.location || '').trim(),
    applicationDate: formData.applicationDate || new Date().toISOString().slice(0, 10),
    jobLink: (formData.jobLink || '').trim(),
    package: (formData.package || '').trim(),
    status: formData.status || 'Applied',
    notes: (formData.notes || '').trim(),
    jobDescription: (formData.jobDescription || '').trim(),
    resumeFileId,
    resumeFileName,
    jdFileId,
    jdFileName,
    rounds: [],
    createdAt: now,
    updatedAt: now,
  };

  await putApplication(record);
  return { ok: true, application: record };
}

/**
 * Edit an existing application's core metadata.
 */
export async function editApplication(id, formData) {
  const existing = await getApplicationById(id);
  if (!existing) {
    return { ok: false, errors: { general: 'Application not found.' } };
  }

  const merged = {
    ...existing,
    company: formData.company !== undefined ? String(formData.company).trim() : existing.company,
    role: formData.role !== undefined ? String(formData.role).trim() : existing.role,
    location: formData.location !== undefined ? String(formData.location).trim() : existing.location,
    applicationDate:
      formData.applicationDate !== undefined
        ? String(formData.applicationDate).trim()
        : existing.applicationDate,
    jobLink: formData.jobLink !== undefined ? String(formData.jobLink).trim() : existing.jobLink,
    package: formData.package !== undefined ? String(formData.package).trim() : existing.package,
    status: formData.status !== undefined ? String(formData.status).trim() : existing.status,
    notes: formData.notes !== undefined ? String(formData.notes).trim() : existing.notes,
    jobDescription:
      formData.jobDescription !== undefined
        ? String(formData.jobDescription).trim()
        : existing.jobDescription,
    updatedAt: Date.now(),
  };

  const validation = validateApplicationInput(merged);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  await putApplication(merged);
  return { ok: true, application: merged };
}

/**
 * Delete an application and clean up its associated stored PDF files.
 */
export async function removeApplication(id) {
  const existing = await getApplicationById(id);
  if (!existing) return { ok: false };

  if (existing.resumeFileId) {
    await deleteFileRecord(existing.resumeFileId);
  }
  if (existing.jdFileId) {
    await deleteFileRecord(existing.jdFileId);
  }

  await deleteApplicationRecord(id);
  return { ok: true };
}

// ---- Recruitment Rounds ----

export async function addRound(applicationId, roundData) {
  const validation = validateRoundInput(roundData);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const app = await getApplicationById(applicationId);
  if (!app) {
    return { ok: false, errors: { general: 'Application not found.' } };
  }

  const newRound = {
    id: createId('round'),
    type: roundData.type.trim(),
    date: (roundData.date || '').trim(),
    status: roundData.status,
    notes: (roundData.notes || '').trim(),
  };

  const updated = {
    ...app,
    rounds: [...(app.rounds || []), newRound],
    updatedAt: Date.now(),
  };

  await putApplication(updated);
  return { ok: true, application: updated, round: newRound };
}

export async function updateRound(applicationId, roundId, roundData) {
  const app = await getApplicationById(applicationId);
  if (!app) {
    return { ok: false, errors: { general: 'Application not found.' } };
  }

  const existingRound = (app.rounds || []).find((r) => r.id === roundId);
  if (!existingRound) {
    return { ok: false, errors: { general: 'Recruitment round not found.' } };
  }

  const mergedRound = {
    ...existingRound,
    type: roundData.type !== undefined ? String(roundData.type).trim() : existingRound.type,
    date: roundData.date !== undefined ? String(roundData.date).trim() : existingRound.date,
    status: roundData.status !== undefined ? String(roundData.status).trim() : existingRound.status,
    notes: roundData.notes !== undefined ? String(roundData.notes).trim() : existingRound.notes,
  };

  const validation = validateRoundInput(mergedRound);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const updated = {
    ...app,
    rounds: (app.rounds || []).map((r) => (r.id === roundId ? mergedRound : r)),
    updatedAt: Date.now(),
  };

  await putApplication(updated);
  return { ok: true, application: updated, round: mergedRound };
}

export async function deleteRound(applicationId, roundId) {
  const app = await getApplicationById(applicationId);
  if (!app) return { ok: false };

  const updated = {
    ...app,
    rounds: (app.rounds || []).filter((r) => r.id !== roundId),
    updatedAt: Date.now(),
  };

  await putApplication(updated);
  return { ok: true, application: updated };
}

// ---- Resume & JD PDF Vault Operations ----

export async function uploadApplicationPdf(applicationId, kind, file) {
  const check = validatePdfFile(file);
  if (!check.valid) {
    return { ok: false, error: check.error };
  }

  const app = await getApplicationById(applicationId);
  if (!app) {
    return { ok: false, error: 'Application not found.' };
  }

  const oldFileId = kind === 'resume' ? app.resumeFileId : app.jdFileId;
  if (oldFileId) {
    await deleteFileRecord(oldFileId);
  }

  const newFileId = createId(kind === 'resume' ? 'file-res' : 'file-jd');
  const fileRecord = {
    id: newFileId,
    applicationId,
    kind,
    name: file.name,
    mimeType: 'application/pdf',
    size: file.size,
    uploadedAt: new Date().toISOString(),
    blob: file,
  };

  await saveFileRecord(fileRecord);

  const updated = {
    ...app,
    ...(kind === 'resume'
      ? { resumeFileId: newFileId, resumeFileName: file.name }
      : { jdFileId: newFileId, jdFileName: file.name }),
    updatedAt: Date.now(),
  };

  await putApplication(updated);
  return { ok: true, application: updated, file: fileRecord };
}

export async function removeApplicationPdf(applicationId, kind) {
  const app = await getApplicationById(applicationId);
  if (!app) return { ok: false };

  const oldFileId = kind === 'resume' ? app.resumeFileId : app.jdFileId;
  if (oldFileId) {
    await deleteFileRecord(oldFileId);
  }

  const updated = {
    ...app,
    ...(kind === 'resume'
      ? { resumeFileId: null, resumeFileName: null }
      : { jdFileId: null, jdFileName: null }),
    updatedAt: Date.now(),
  };

  await putApplication(updated);
  return { ok: true, application: updated };
}

export async function getStoredPdfRecord(fileId) {
  if (!fileId) return null;
  return getFileRecord(fileId);
}

export async function downloadStoredPdf(fileId) {
  const record = await getFileRecord(fileId);
  if (!record || !record.blob) {
    return { ok: false, error: 'Document not found in IndexedDB.' };
  }

  const blob =
    record.blob instanceof Blob
      ? record.blob
      : new Blob([record.blob], { type: record.mimeType || 'application/pdf' });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = record.name || 'document.pdf';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { ok: true, name: record.name };
}
