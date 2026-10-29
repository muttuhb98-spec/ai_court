import { sampleCase } from '../../server/src/data/sampleCase.js';

const KEY = 'aicourt:browser-demo';

function readState() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { users: [], currentUserId: null, cases: [] };
  } catch {
    return { users: [], currentUserId: null, cases: [] };
  }
}

function writeState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function currentUser(state) {
  return state.users.find(user => user.id === state.currentUserId);
}

function requireUser(state) {
  const user = currentUser(state);
  if (!user) throw new Error('Please sign in to continue.');
  return user;
}

function publicCase(item) {
  const result = structuredClone(item);
  if (result.status !== 'solved') {
    delete result.solution;
    delete result.result;
    delete result.accusation;
    delete result.hints;
  }
  return result;
}

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: Uint8Array.from(atob(salt), char => char.charCodeAt(0)), iterations: 120000, hash: 'SHA-256' }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export async function requestDemoApi(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const state = readState();

  if (path === '/auth/register' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    if (state.users.some(user => user.email === email)) throw new Error('An account with this email already exists.');
    const salt = randomSalt();
    const user = { id: crypto.randomUUID(), email, displayName: body.displayName || email.split('@')[0], passwordSalt: salt, passwordHash: await passwordHash(body.password, salt) };
    state.users.push(user);
    state.currentUserId = user.id;
    writeState(state);
    return { user: { id: user.id, email: user.email, displayName: user.displayName } };
  }

  if (path === '/auth/login' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const user = state.users.find(item => item.email === email);
    if (!user || await passwordHash(body.password || '', user.passwordSalt) !== user.passwordHash) throw new Error('Email or password is incorrect.');
    state.currentUserId = user.id;
    writeState(state);
    return { user: { id: user.id, email: user.email, displayName: user.displayName } };
  }

  if (path === '/auth/logout' && method === 'POST') {
    state.currentUserId = null;
    writeState(state);
    return null;
  }

  if (path === '/auth/me') {
    const user = currentUser(state);
    if (!user) throw new Error('Please sign in to continue.');
    return { user: { id: user.id, email: user.email, displayName: user.displayName } };
  }

  const signedIn = requireUser(state);

  if (path === '/cases' && method === 'POST') {
    const id = crypto.randomUUID();
    const item = {
      ...structuredClone(sampleCase), id, userId: signedIn.id, seed: body.seed,
      difficulty: body.difficulty || 'medium', tone: body.tone || 'realistic', status: 'ready',
      stage: 'Finalize', progress: 100, error: null, hintsAvailable: sampleCase.hints.length,
      hintsUsed: 0, createdAt: new Date().toISOString(), readyAt: Date.now(),
      accusation: null, result: null
    };
    state.cases.unshift(item);
    writeState(state);
    return { caseId: id };
  }

  if (path === '/cases' && method === 'GET') {
    const cases = state.cases.filter(item => item.userId === signedIn.id);
    return { cases: cases.map(item => ({ id: item.id, title: item.title, status: item.status, difficulty: item.difficulty, result: item.result ? { correct: item.result.correct } : undefined, createdAt: item.createdAt })), page: 1, limit: 10, total: cases.length };
  }

  const match = path.match(/^\/cases\/([^/]+)(?:\/(status|hint|accuse|retry))?$/);
  if (!match) throw new Error('This demo action is not available.');
  const [, id, action] = match;
  const item = state.cases.find(entry => entry.id === id && entry.userId === signedIn.id);
  if (!item) throw new Error('Case file not found.');

  if (action === 'status') return { status: item.status, stage: item.stage, progress: item.progress, error: item.error };
  if (action === 'hint' && method === 'POST') {
    if (item.hintsUsed >= item.hintsAvailable) throw new Error('You have used all available hints.');
    const hint = item.hints[item.hintsUsed++];
    writeState(state);
    return { level: hint.level, text: hint.text, hintsRemaining: item.hintsAvailable - item.hintsUsed };
  }
  if (action === 'accuse' && method === 'POST') {
    if (!item.suspects.some(suspect => suspect.id === body.suspectId)) throw new Error('Select a suspect from this case.');
    item.accusation = { suspectId: body.suspectId, reasoning: body.reasoning || '', submittedAt: new Date().toISOString() };
    const correct = body.suspectId === item.solution.culpritId;
    const base = correct ? 1000 : 0;
    const hintPenalty = correct ? Math.min(base, item.hintsUsed * 150) : 0;
    const timeBonus = correct ? Math.max(0, Math.round(200 * (1 - Math.min(Date.now() - item.readyAt, 30 * 60_000) / (30 * 60_000)))) : 0;
    item.result = { correct, score: Math.max(0, base - hintPenalty + timeBonus), breakdown: { base, hintPenalty, timeBonus } };
    item.status = 'solved';
    writeState(state);
    return publicCase(item);
  }

  if (!action) return publicCase(item);
  throw new Error('This demo action is not available.');
}

