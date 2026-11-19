import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEventUrgency,
  formatCountdown,
  extractEvents,
  computeDashboardMetrics,
  filterApplications,
  validateApplicationInput,
  validateRoundInput,
  validatePdfFile,
  generateMinimalPdfBytes,
  runLocalDemoAnalysis,
} from './logic.js';

const NOW = new Date('2026-11-19T12:00:00.000Z').getTime();

function isoOffsetHours(hours: number) {
  return new Date(NOW + hours * 3600000).toISOString();
}

const sampleApps = [
  {
    id: 'app-hpe',
    company: 'HPE',
    role: 'Software Engineer',
    location: 'Bengaluru',
    applicationDate: '2026-11-10',
    package: '16 LPA',
    status: 'In Progress',
    notes: 'Review OS & DSA',
    resumeFileId: 'res-1',
    rounds: [
      {
        id: 'r-hpe-1',
        type: 'Online Assessment',
        date: isoOffsetHours(18),
        status: 'Upcoming',
        notes: 'HackerRank 90 mins',
      },
    ],
  },
  {
    id: 'app-atlassian',
    company: 'Atlassian',
    role: 'Associate Software Engineer',
    location: 'Remote',
    applicationDate: '2026-11-12',
    package: '28 LPA',
    status: 'Interviewing',
    notes: 'DSA + System Design',
    resumeFileId: null,
    rounds: [
      {
        id: 'r-att-1',
        type: 'Coding Test',
        date: isoOffsetHours(-72),
        status: 'Passed',
        notes: 'Solved both problems',
      },
      {
        id: 'r-att-2',
        type: 'Technical Interview',
        date: isoOffsetHours(48),
        status: 'Upcoming',
        notes: 'Rate limiter & data structures',
      },
    ],
  },
  {
    id: 'app-msft',
    company: 'Microsoft',
    role: 'SWE Intern',
    location: 'Hyderabad',
    applicationDate: '2026-11-05',
    package: '22 LPA',
    status: 'Interviewing',
    notes: 'Waiting on HR decision',
    resumeFileId: 'res-2',
    rounds: [
      {
        id: 'r-msft-1',
        type: 'HR Interview',
        date: isoOffsetHours(-24),
        status: 'Awaiting Result',
        notes: 'Expected next week',
      },
    ],
  },
  {
    id: 'app-cisco',
    company: 'Cisco',
    role: 'Systems Engineer',
    location: 'Bengaluru',
    applicationDate: '2026-10-28',
    package: '18 LPA',
    status: 'Offer',
    notes: 'Offer letter received',
    resumeFileId: 'res-3',
    rounds: [
      {
        id: 'r-cisco-1',
        type: 'Final Result',
        date: isoOffsetHours(-120),
        status: 'Completed',
        notes: 'Selected',
      },
    ],
  },
];

test('getEventUrgency classifies <=24h red, <=72h orange, and completed green', () => {
  const urgent = getEventUrgency(
    { type: 'Online Assessment', date: isoOffsetHours(18), status: 'Upcoming' },
    NOW
  );
  assert.equal(urgent.level, 'urgent');
  assert.equal(urgent.isUrgent24h, true);

  const soon = getEventUrgency(
    { type: 'Technical Interview', date: isoOffsetHours(48), status: 'Upcoming' },
    NOW
  );
  assert.equal(soon.level, 'soon');
  assert.equal(soon.isSoon3d, true);

  const completed = getEventUrgency(
    { type: 'Coding Test', date: isoOffsetHours(-24), status: 'Completed' },
    NOW
  );
  assert.equal(completed.level, 'completed');

  const passed = getEventUrgency(
    { type: 'Coding Test', date: isoOffsetHours(-24), status: 'Passed' },
    NOW
  );
  assert.equal(passed.level, 'completed');
});

test('formatCountdown renders readable relative durations', () => {
  assert.equal(formatCountdown(isoOffsetHours(18), NOW), 'In 18h');
  assert.equal(formatCountdown(isoOffsetHours(50), NOW), 'In 2d 2h');
  assert.equal(formatCountdown(isoOffsetHours(-5), NOW), 'Overdue by 5h');
  assert.equal(formatCountdown('', NOW), 'Date TBD');
});

test('computeDashboardMetrics aggregates accurate counts from real data', () => {
  const metrics = computeDashboardMetrics(sampleApps, NOW);
  assert.equal(metrics.totalApplications, 4);
  assert.equal(metrics.upcomingExams, 1); // HPE Online Assessment
  assert.equal(metrics.interviews, 2); // Atlassian Tech Interview + Microsoft HR Interview
  assert.equal(metrics.offers, 1); // Cisco
  assert.equal(metrics.pendingResults, 1); // Microsoft HR Awaiting Result
  assert.equal(metrics.urgentCount24h, 1); // HPE < 24h
  assert.equal(metrics.soonCount3d, 1); // Atlassian < 72h
  assert.equal(metrics.completedRoundsCount, 2); // Atlassian Passed + Cisco Completed
});

test('filterApplications filters by search text and status accurately', () => {
  const filteredByQuery = filterApplications(sampleApps, { query: 'hyderabad' }, NOW);
  assert.equal(filteredByQuery.length, 1);
  assert.equal(filteredByQuery[0].company, 'Microsoft');

  const filteredByStatus = filterApplications(sampleApps, { status: 'Offer' }, NOW);
  assert.equal(filteredByStatus.length, 1);
  assert.equal(filteredByStatus[0].company, 'Cisco');

  const sortedUrgent = filterApplications(sampleApps, { sortBy: 'urgent' }, NOW);
  assert.equal(sortedUrgent[0].company, 'HPE');
});

test('form validators reject invalid inputs and accept valid inputs', () => {
  const badApp = validateApplicationInput({ company: '', role: '', jobLink: 'not-a-url' });
  assert.equal(badApp.valid, false);
  assert.ok(badApp.errors.company);
  assert.ok(badApp.errors.role);
  assert.ok(badApp.errors.jobLink);

  const goodApp = validateApplicationInput({
    company: 'Nvidia',
    role: 'Systems Software Engineer',
    status: 'Applied',
    jobLink: 'https://nvidia.com/careers',
  });
  assert.equal(goodApp.valid, true);

  const badRound = validateRoundInput({ type: 'Coding Test', status: 'Upcoming', date: '' });
  assert.equal(badRound.valid, false);
  assert.ok(badRound.errors.date);

  const badPdf = validatePdfFile({ name: 'resume.docx', type: 'application/msword', size: 1024 });
  assert.equal(badPdf.valid, false);

  const goodPdf = validatePdfFile({ name: 'resume.pdf', type: 'application/pdf', size: 2048 });
  assert.equal(goodPdf.valid, true);
});

test('generateMinimalPdfBytes produces a valid PDF header and EOF marker', () => {
  const bytes = generateMinimalPdfBytes('Sample Resume', ['Software Engineer', 'Skills: JS, C++']);
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.includes('%%EOF'));
  assert.ok(text.includes('Sample Resume'));
});

test('runLocalDemoAnalysis grounds advice strictly in saved applications and supports confirmation proposals', () => {
  const events = extractEvents(sampleApps, NOW).filter(
    (e) => e.round.status === 'Upcoming' || e.round.status === 'Awaiting Result'
  );
  const analysis = runLocalDemoAnalysis('Analyze my placement', sampleApps, events, NOW);
  assert.ok(analysis.markdown.includes('HPE'));
  assert.ok(analysis.markdown.includes('Online Assessment'));
  assert.equal(analysis.markdown.includes('Amazon'), false); // Never invents companies

  const updateRes = runLocalDemoAnalysis('Update HPE status to Interviewing', sampleApps, events, NOW);
  assert.ok(updateRes.proposedUpdate);
  assert.equal(updateRes.proposedUpdate.applicationId, 'app-hpe');
  assert.equal(updateRes.proposedUpdate.updates.status, 'Interviewing');

  const emptyRes = runLocalDemoAnalysis('Analyze my placement', [], [], NOW);
  assert.ok(emptyRes.markdown.toLowerCase().includes('do not have any job applications'));
});
