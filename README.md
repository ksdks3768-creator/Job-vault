# CareerVault AI

**Personal Job Application Tracker & AI Placement Assistant**

CareerVault AI is a lightweight, offline-first SaaS web application built with **HTML, CSS, Vanilla JavaScript, and IndexedDB** to help students and job seekers organize job applications, store exact submitted resumes and job descriptions (PDFs & text), track multi-stage recruitment rounds with countdown alerts, and receive grounded placement strategy insights powered by the **Gemini API** (with a built-in Local Demo Mode when the API is unavailable).

---

## Features

- **Application Tracker**: Add, edit, search, sort, filter, and delete job applications with company, role, location, application date, job link, compensation package, status, and notes.
- **Job Description Vault**: Save pasted job description text and upload/store JD PDFs directly in browser IndexedDB for offline access, viewing, replacing, and downloading.
- **Resume Vault**: Upload the exact resume PDF submitted for each company. Preview PDFs in-app, download them with original filenames, or replace them anytime.
- **Recruitment Round Tracker**: Track multi-stage timelines (`Online Assessment`, `Coding Test`, `Technical Interview`, `System Design`, `Managerial Round`, `HR Interview`, `Final Result`) with dates, statuses (`Upcoming`, `Completed`, `Passed`, `Failed`, `Awaiting Result`), and round notes.
- **Upcoming Events & Visual Alerts**: Real-time countdowns and semantic alerts:
  - **Red Alert (with circular indicator)**: Events within 24 hours (or overdue).
  - **Orange Alert**: Events within 3 days.
  - **Green**: Completed or passed rounds.
- **Full Application Details Workspace**: Click any company to open its complete dossier—recruitment timeline, resume PDF vault, job description vault, notes, and quick status updates.
- **AI Placement Assistant**: Click **Analyze My Placement** to get a grounded progress summary and prioritized action plan based strictly on your saved IndexedDB records. Uses simple JavaScript tool functions (`getApplications()`, `getUpcomingEvents()`, `updateApplication()`) and always requires your explicit confirmation before modifying any record.
- **Zero-Key Demo Mode**: Automatically runs deterministic local placement analysis using your real IndexedDB data when no Gemini API key is configured.

---

## Technologies Used

- **Frontend**: Semantic HTML5, Modern CSS3 (Custom Properties, Grid, Flexbox), Vanilla ES6+ JavaScript (ES Modules)
- **Local Persistence**: Browser **IndexedDB** (`applications`, `files`, and `meta` object stores for structured records + real PDF `Blob` storage)
- **AI Integration**: Google **Gemini API** (`@google/genai` SDK via lightweight server-side proxy `/api/gemini/analyze` with function calling) + Local Demo Mode fallback
- **Testing**: Built-in Node.js test runner (`node:test`) for pure domain logic

---

## Folder Structure

```text
CareerVault-AI/
├── index.html             # Main semantic HTML shell, sidebar, top bar, and modals
├── style.css              # Complete light-theme SaaS design system and responsive layout
├── server.ts              # Lightweight dev/static server & secure server-side Gemini API proxy
├── README.md              # Project documentation
├── .env.example           # Environment variable template (never commit .env!)
├── .gitignore             # Excludes node_modules, dist, and .env secrets
├── assets/
│   └── icons/
│       └── vault-logo.svg # Brand icon
└── js/
    ├── app.js             # Entry point, state management, routing, and DOM event listeners
    ├── ui.js              # Modular DOM view renderers (Dashboard, Applications, Details, Events, Vault, AI)
    ├── database.js        # IndexedDB wrapper & first-launch sample dataset seeder
    ├── applications.js    # Application, recruitment round, and PDF vault CRUD operations
    ├── agent.js           # AI Placement Assistant orchestrator & confirmation workflow
    ├── agent-tools.js     # Tool functions: getApplications(), getUpcomingEvents(), updateApplication()
    ├── gemini.js          # Client bridge to /api/gemini/analyze with graceful Demo Mode fallback
    ├── logic.js           # Pure domain logic (urgency alerts, countdowns, KPIs, validators, Demo Mode)
    └── logic.test.ts      # Unit tests for core logic
```

---

## How to Run Locally

### Option 1: Full App with Gemini API Support (Recommended)

1. Clone the repository and install dependencies:
   ```bash
   git clone <your-repo-url>
   cd CareerVault-AI
   npm install
   ```
2. Start the local server on port 3000:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000` in your browser.

### Option 2: Pure Static Mode (Demo Mode AI, Zero Backend Needed)

Because all application data and uploaded PDFs live in **IndexedDB**, you can also serve the static files with any local HTTP server (such as VS Code Live Server or `npx serve`):

```bash
npx serve .
```

In static mode, every tracker, PDF vault, and timeline feature works identically, and the AI Placement Assistant automatically runs in **Local Demo Mode** against your real IndexedDB data.

### Run Unit Tests

```bash
npx tsx --test js/logic.test.ts
```

---

## How to Configure Gemini API

Never commit API keys to GitHub. CareerVault AI keeps your API key strictly on the server via environment variables:

1. Copy `.env.example` to `.env` (already listed in `.gitignore`):
   ```bash
   cp .env.example .env
   ```
2. Add your Gemini API key from Google AI Studio to `.env`:
   ```env
   GEMINI_API_KEY="your_actual_gemini_api_key"
   ```
3. Restart the server (`npm run dev`). The AI Placement Assistant will automatically connect to Gemini (`gemini-4-hydrogen`) with tool calling enabled. If the key is omitted or unavailable, the app automatically falls back to Local Demo Mode.

---

## Screenshots

> Add screenshots of your running CareerVault AI workspace here before publishing to GitHub:
>
> - `![Dashboard Overview](docs/screenshots/dashboard.png)`
> - `![Application Details & Recruitment Timeline](docs/screenshots/application-details.png)`
> - `![Document Vault & PDF Preview](docs/screenshots/document-vault.png)`
> - `![AI Placement Assistant](docs/screenshots/ai-assistant.png)`

---

## Future Improvements

- Export and import full IndexedDB backups (JSON + PDF archive) for moving between devices.
- Browser notification reminders for upcoming assessments within 24 hours.
- Side-by-side comparison view for multiple offers (base salary, equity, location, deadline).
- Calendar `.ics` export for upcoming interviews and coding tests.
