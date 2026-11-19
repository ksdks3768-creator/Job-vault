/**
 * IndexedDB persistence layer for CareerVault AI.
 * Stores job applications, uploaded PDF Blobs (Resumes & JDs), and app metadata locally in the browser.
 */

import { generateMinimalPdfBytes } from './logic.js';

const DB_NAME = 'CareerVaultDB';
const DB_VERSION = 1;

export const STORES = {
  APPLICATIONS: 'applications',
  FILES: 'files',
  META: 'meta',
};

let dbPromise = null;

/**
 * Open (or upgrade) the IndexedDB database.
 */
export function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this browser.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.APPLICATIONS)) {
        const appStore = db.createObjectStore(STORES.APPLICATIONS, { keyPath: 'id' });
        appStore.createIndex('status', 'status', { unique: false });
        appStore.createIndex('company', 'company', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.FILES)) {
        const fileStore = db.createObjectStore(STORES.FILES, { keyPath: 'id' });
        fileStore.createIndex('applicationId', 'applicationId', { unique: false });
        fileStore.createIndex('kind', 'kind', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
  });

  return dbPromise;
}

function runTransaction(storeName, mode, operation) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let result;

        try {
          const req = operation(store);
          if (req && typeof req === 'object' && 'onsuccess' in req) {
            req.onsuccess = () => {
              result = req.result;
            };
            req.onerror = () => reject(req.error);
          } else {
            result = req;
          }
        } catch (err) {
          reject(err);
          return;
        }

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
      })
  );
}

// ---- Applications Store ----

export function getAllApplications() {
  return runTransaction(STORES.APPLICATIONS, 'readonly', (store) => store.getAll());
}

export function getApplicationById(id) {
  return runTransaction(STORES.APPLICATIONS, 'readonly', (store) => store.get(id));
}

export function putApplication(application) {
  return runTransaction(STORES.APPLICATIONS, 'readwrite', (store) => store.put(application));
}

export function deleteApplicationRecord(id) {
  return runTransaction(STORES.APPLICATIONS, 'readwrite', (store) => store.delete(id));
}

// ---- Files Store (PDF Blobs) ----

export function saveFileRecord(fileRecord) {
  return runTransaction(STORES.FILES, 'readwrite', (store) => store.put(fileRecord));
}

export function getFileRecord(id) {
  return runTransaction(STORES.FILES, 'readonly', (store) => store.get(id));
}

export function getAllFiles() {
  return runTransaction(STORES.FILES, 'readonly', (store) => store.getAll());
}

export function deleteFileRecord(id) {
  return runTransaction(STORES.FILES, 'readwrite', (store) => store.delete(id));
}

// ---- Meta Store ----

export function getMeta(key) {
  return runTransaction(STORES.META, 'readonly', (store) => store.get(key));
}

export function setMeta(key, value) {
  return runTransaction(STORES.META, 'readwrite', (store) => store.put({ key, value }));
}

// ---- Sample Seed Data ----

function toLocalDateTimeInput(offsetHours) {
  const dt = new Date(Date.now() + offsetHours * 3600000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(
    dt.getHours()
  )}:${pad(dt.getMinutes())}`;
}

function toLocalDateInput(offsetDays) {
  const dt = new Date(Date.now() + offsetDays * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function makeSamplePdfFile({ id, applicationId, kind, name, title, lines }) {
  const bytes = generateMinimalPdfBytes(title, lines);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  return {
    id,
    applicationId,
    kind,
    name,
    mimeType: 'application/pdf',
    size: blob.size,
    uploadedAt: new Date().toISOString(),
    blob,
  };
}

function buildSampleDataset() {
  const now = Date.now();

  const sampleFiles = [
    makeSamplePdfFile({
      id: 'file-hpe-resume',
      applicationId: 'sample-hpe',
      kind: 'resume',
      name: 'Resume_HPE_Systems_SWE.pdf',
      title: 'Candidate Resume - HPE Software Engineer',
      lines: [
        'Target Role: Software Engineer (Campus / New Grad) - HPE',
        'Focus: Distributed Systems, C++, Linux Internals, Python, REST APIs',
        '----------------------------------------------------------------------',
        'EDUCATION',
        'B.Tech in Computer Science & Engineering | CGPA: 8.9 / 10',
        '',
        'KEY PROJECTS',
        '1. Distributed Key-Value Store (Go, Raft Consensus, gRPC)',
        '   - Built fault-tolerant storage engine handling 12k ops/sec in benchmarks.',
        '2. CareerVault AI (HTML, CSS, Vanilla JS, IndexedDB)',
        '   - Offline-first placement tracker with PDF vault and Gemini analysis.',
        '',
        'CORE SKILLS',
        'Languages: C++, JavaScript, Python, Go, SQL',
        'Systems: Linux, Operating Systems, Computer Networks, Docker, Git',
      ],
    }),
    makeSamplePdfFile({
      id: 'file-hpe-jd',
      applicationId: 'sample-hpe',
      kind: 'jd',
      name: 'HPE_Software_Engineer_JD.pdf',
      title: 'Hewlett Packard Enterprise - Job Description',
      lines: [
        'Role: Software Engineer - Cloud & Storage Platform',
        'Location: Bengaluru, India (Hybrid) | Compensation: 16.5 LPA',
        '----------------------------------------------------------------------',
        'RESPONSIBILITIES',
        '- Design and implement high-availability cloud storage microservices.',
        '- Collaborate with platform engineers on performance diagnostics.',
        '- Write automated integration tests and CI pipelines.',
        '',
        'REQUIREMENTS',
        '- Strong fundamentals in Data Structures, Algorithms, and OS.',
        '- Proficiency in C++, Java, Go, or Python.',
        '- Familiarity with Linux networking, REST APIs, and containers.',
      ],
    }),
    makeSamplePdfFile({
      id: 'file-atlassian-resume',
      applicationId: 'sample-atlassian',
      kind: 'resume',
      name: 'Resume_Atlassian_Backend_SWE.pdf',
      title: 'Candidate Resume - Atlassian Associate SWE',
      lines: [
        'Target Role: Associate Software Engineer - Atlassian',
        'Focus: Backend Engineering, API Design, Concurrency, Java/TypeScript',
        '----------------------------------------------------------------------',
        'HIGHLIGHTS',
        '- Built real-time collaborative issue board supporting 500+ active boards.',
        '- Optimized PostgreSQL indexing, reducing p95 latency by 62%.',
        '- Strong track record in DSA, rate limiters, and clean modular design.',
      ],
    }),
    makeSamplePdfFile({
      id: 'file-cisco-resume',
      applicationId: 'sample-cisco',
      kind: 'resume',
      name: 'Resume_Cisco_Systems_Engineer.pdf',
      title: 'Candidate Resume - Cisco Systems Engineer',
      lines: [
        'Target Role: Systems Engineer - Enterprise Networking (Offer Received)',
        'Focus: TCP/IP, Linux Kernel Networking, Python Automation, Telemetry',
        '----------------------------------------------------------------------',
        'INTERNSHIP & PROJECTS',
        '- Network Packet Analyzer & Flow Visualizer (C, eBPF, WebSockets)',
        '- Automated Router Config Compliance Validator (Python, Netmiko)',
      ],
    }),
  ];

  const sampleApplications = [
    {
      id: 'sample-hpe',
      company: 'HPE',
      role: 'Software Engineer — Cloud & Storage',
      location: 'Bengaluru (Hybrid)',
      applicationDate: toLocalDateInput(-9),
      jobLink: 'https://careers.hpe.com/',
      package: '16.5 LPA',
      status: 'In Progress',
      notes: 'Revise OS scheduling, virtual memory, and graph algorithms before the online assessment.',
      jobDescription:
        'Join Hewlett Packard Enterprise Cloud & Storage Engineering to build resilient data-plane services.\n\nKey Responsibilities:\n- Develop scalable backend and systems components in C++, Go, or Python.\n- Troubleshoot Linux performance bottlenecks and storage reliability.\n- Collaborate across global engineering pods with clean code reviews.\n\nPreferred Skills:\n- Strong DSA, Operating Systems, Computer Networks, and RESTful APIs.',
      resumeFileId: 'file-hpe-resume',
      resumeFileName: 'Resume_HPE_Systems_SWE.pdf',
      jdFileId: 'file-hpe-jd',
      jdFileName: 'HPE_Software_Engineer_JD.pdf',
      createdAt: now - 9 * 86400000,
      updatedAt: now - 3600000,
      rounds: [
        {
          id: 'round-hpe-1',
          type: 'Online Assessment',
          date: toLocalDateTimeInput(18),
          status: 'Upcoming',
          notes: '90-minute HackerRank test: 2 DSA problems + 15 OS/CN MCQs.',
        },
        {
          id: 'round-hpe-2',
          type: 'Technical Interview',
          date: toLocalDateTimeInput(144),
          status: 'Upcoming',
          notes: 'Tentative if shortlisted from Online Assessment.',
        },
      ],
    },
    {
      id: 'sample-atlassian',
      company: 'Atlassian',
      role: 'Associate Software Engineer',
      location: 'Remote / Bengaluru',
      applicationDate: toLocalDateInput(-14),
      jobLink: 'https://www.atlassian.com/company/careers',
      package: '28 LPA',
      status: 'Interviewing',
      notes: 'Cleared coding round with optimal solution. Focus on clean code structure & rate limiter design.',
      jobDescription:
        'Work on Jira and Confluence cloud infrastructure serving millions of daily active users.\n\nWhat You Will Do:\n- Design clean, testable backend services and APIs.\n- Partner with product managers and engineers to ship iterative improvements.\n- Practice Atlassian values: open company, build with heart and balance.\n\nInterview Focus:\n- Data Structures, Code Design (low-level design), and Team Values.',
      resumeFileId: 'file-atlassian-resume',
      resumeFileName: 'Resume_Atlassian_Backend_SWE.pdf',
      jdFileId: null,
      jdFileName: null,
      createdAt: now - 14 * 86400000,
      updatedAt: now - 7200000,
      rounds: [
        {
          id: 'round-att-1',
          type: 'Coding Test',
          date: toLocalDateTimeInput(-96),
          status: 'Passed',
          notes: 'Solved both medium-hard string & graph problems with full test pass.',
        },
        {
          id: 'round-att-2',
          type: 'Technical Interview',
          date: toLocalDateTimeInput(46),
          status: 'Upcoming',
          notes: '60-min Low-Level Design & Data Structures round (practice sliding-window rate limiter).',
        },
      ],
    },
    {
      id: 'sample-microsoft',
      company: 'Microsoft',
      role: 'Software Engineer (University Grad)',
      location: 'Hyderabad',
      applicationDate: toLocalDateInput(-21),
      jobLink: 'https://careers.microsoft.com/',
      package: '24 LPA',
      status: 'Interviewing',
      notes: 'Both technical rounds went well. Recruiter mentioned feedback would be shared within a week.',
      jobDescription:
        'Build intelligent developer productivity tools and cloud infrastructure within Azure Core.\n\nRequirements:\n- B.Tech / B.E. in CS or equivalent.\n- Strong problem-solving, testing discipline, and distributed systems fundamentals.\n- Experience with C#, Java, C++, or TypeScript.',
      resumeFileId: null,
      resumeFileName: null,
      jdFileId: null,
      jdFileName: null,
      createdAt: now - 21 * 86400000,
      updatedAt: now - 10800000,
      rounds: [
        {
          id: 'round-msft-1',
          type: 'Online Assessment',
          date: toLocalDateTimeInput(-360),
          status: 'Passed',
          notes: 'Codility 2 problems completed in 45 minutes.',
        },
        {
          id: 'round-msft-2',
          type: 'Technical Interview',
          date: toLocalDateTimeInput(-168),
          status: 'Passed',
          notes: 'Trees, DP, and debugging an async caching bug.',
        },
        {
          id: 'round-msft-3',
          type: 'HR Interview',
          date: toLocalDateTimeInput(-48),
          status: 'Awaiting Result',
          notes: 'AA / Hiring Manager discussion completed. Awaiting final decision email.',
        },
      ],
    },
    {
      id: 'sample-cisco',
      company: 'Cisco',
      role: 'Systems Engineer — Enterprise Networking',
      location: 'Bengaluru',
      applicationDate: toLocalDateInput(-32),
      jobLink: 'https://jobs.cisco.com/',
      package: '18 LPA',
      status: 'Offer',
      notes: 'Offer letter received! Acceptance deadline is in 12 days.',
      jobDescription:
        'Engineer next-generation telemetry and routing software for Cisco Catalyst platforms.\n\nQualifications:\n- Solid understanding of TCP/IP, HTTP, DNS, and Linux internals.\n- Hands-on coding in C, C++, or Python.',
      resumeFileId: 'file-cisco-resume',
      resumeFileName: 'Resume_Cisco_Systems_Engineer.pdf',
      jdFileId: null,
      jdFileName: null,
      createdAt: now - 32 * 86400000,
      updatedAt: now - 86400000,
      rounds: [
        {
          id: 'round-cisco-1',
          type: 'Online Assessment',
          date: toLocalDateTimeInput(-600),
          status: 'Passed',
          notes: 'Networking MCQs + 2 coding problems.',
        },
        {
          id: 'round-cisco-2',
          type: 'Technical Interview',
          date: toLocalDateTimeInput(-420),
          status: 'Passed',
          notes: 'Deep dive into socket programming and routing tables.',
        },
        {
          id: 'round-cisco-3',
          type: 'Final Result',
          date: toLocalDateTimeInput(-140),
          status: 'Completed',
          notes: 'Full-time offer extended at 18 LPA.',
        },
      ],
    },
    {
      id: 'sample-stripe',
      company: 'Stripe',
      role: 'Backend Engineer — New Grad',
      location: 'Bengaluru / Remote',
      applicationDate: toLocalDateInput(-4),
      jobLink: 'https://stripe.com/jobs',
      package: '32 LPA',
      status: 'Applied',
      notes: 'Referred by senior alum. Prepare clean API debugging & practical string parsing problems.',
      jobDescription:
        'Build financial infrastructure APIs powering global commerce.\n\nWhat We Look For:\n- Ability to read, debug, and extend real-world codebases rapidly.\n- Careful attention to edge cases, idempotency, and API ergonomics.',
      resumeFileId: null,
      resumeFileName: null,
      jdFileId: null,
      jdFileName: null,
      createdAt: now - 4 * 86400000,
      updatedAt: now - 4 * 86400000,
      rounds: [
        {
          id: 'round-stripe-1',
          type: 'Coding Test',
          date: toLocalDateTimeInput(132),
          status: 'Upcoming',
          notes: 'Practical HackerRank integration exercise (60 mins).',
        },
      ],
    },
  ];

  return { sampleApplications, sampleFiles };
}

/**
 * Seeds sample applications & sample PDFs on very first launch only.
 * If the user deletes all sample applications later, they stay deleted across reloads.
 */
export async function seedSampleDataIfNeeded() {
  const meta = await getMeta('initialized');
  if (meta && meta.value === true) {
    return false;
  }

  const existing = await getAllApplications();
  if (existing.length > 0) {
    await setMeta('initialized', true);
    return false;
  }

  await loadSampleData();
  await setMeta('initialized', true);
  return true;
}

/**
 * Explicitly loads the sample applications and sample PDFs into IndexedDB.
 */
export async function loadSampleData() {
  const { sampleApplications, sampleFiles } = buildSampleDataset();
  for (const file of sampleFiles) {
    await saveFileRecord(file);
  }
  for (const app of sampleApplications) {
    await putApplication(app);
  }
}
