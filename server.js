import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

// File paths
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LEVELS_FILE = path.join(DATA_DIR, 'levels.json');
const RATINGS_FILE = path.join(DATA_DIR, 'ratings.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

// --- Rate Limiter (simple in-memory) ---
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60;        // 60 requests per window

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = rateLimitMap.get(ip);

  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    entry = { start: now, count: 0 };
    rateLimitMap.set(ip, entry);
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'You\'ve been rate limited. Please wait up to 1 minute to keep sending requests.' });
  }

  next();
}

app.use('/api', rateLimit);

// Cleanup stale rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.start > RATE_LIMIT_WINDOW * 2) rateLimitMap.delete(ip);
  }
}, RATE_LIMIT_WINDOW * 2);

// --- Async Helper Functions ---

/**
 * Atomically write JSON data to a file.
 * Writes to a temp file first, then renames to avoid corruption.
 */
async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpFile = path.join(os.tmpdir(), `gdhtml_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
  const content = JSON.stringify(data, null, 2);

  try {
    await fs.writeFile(tmpFile, content, 'utf8');
    // Copy to destination then remove temp (rename across devices can fail)
    await fs.copyFile(tmpFile, filePath);
    await fs.unlink(tmpFile).catch(() => { });
  } catch (err) {
    // Cleanup temp file on failure
    await fs.unlink(tmpFile).catch(() => { });
    throw err;
  }
}

/**
 * Read and parse a JSON file, returning fallback if not found or invalid.
 */
async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await writeJsonAtomic(filePath, fallback);
      return fallback;
    }
    console.error(`Error reading ${filePath}:`, err.message);
    return fallback;
  }
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeUser(user) {
  const { password, ...rest } = user;
  return rest;
}

/**
 * Sanitize a string: trim, limit length, strip HTML.
 */
function sanitizeString(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen).replace(/[<>]/g, '');
}

// Real-Geometry-Dash-style difficulty tiers and their star payouts.
const DIFFICULTY_STARS = {
  'Easy': 1, 'Normal': 2, 'Hard': 3, 'Harder': 5, 'Insane': 7,
  'Easy Demon': 10, 'Medium Demon': 10, 'Hard Demon': 10,
  'Insane Demon': 10, 'Extreme Demon': 10
};

function starsForDifficulty(difficulty, fallback = 1) {
  return DIFFICULTY_STARS[difficulty] ?? fallback;
}

function sortLevels(levels, sort) {
  const list = [...levels];
  if (sort === 'likes') return list.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  if (sort === 'downloads') return list.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // 'recent' / default
}

// --- Init Data Files (sync on startup only) ---
if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });
for (const [file, fallback] of [
  [USERS_FILE, []],
  [LEVELS_FILE, []],
  [RATINGS_FILE, []],
  [COMMENTS_FILE, {}],
]) {
  if (!fsSync.existsSync(file)) {
    fsSync.writeFileSync(file, JSON.stringify(fallback, null, 2));
  }
}

// --- Error Handler Wrapper ---
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ====================================================================
// ROUTES
// ====================================================================

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'GDHTML community API running', uptime: process.uptime() });
});

// --- AUTHENTICATION ---

app.post('/api/register', asyncHandler(async (req, res) => {
  const username = sanitizeString(req.body?.username, 30);
  const password = req.body?.password;

  if (!username || username.length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters!' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters!' });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and hyphens' });
  }

  const users = await readJson(USERS_FILE, []);
  const existing = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = {
    id: makeId('user'),
    username,
    password: hashed,
    stars: 0,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  await writeJsonAtomic(USERS_FILE, users);
  res.status(201).json({ user: sanitizeUser(user) });
}));

app.post('/api/login', asyncHandler(async (req, res) => {
  const username = sanitizeString(req.body?.username, 30);
  const password = req.body?.password;
  console.log("SENDING POST REQUEST WITH CREDS: " + username + password)

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const users = await readJson(USERS_FILE, []);
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  console.log("sanitizing")
  res.json({ user: sanitizeUser(user) });
}));

// --- LEADERBOARD ---

app.get('/api/leaderboard', asyncHandler(async (_req, res) => {
  const users = await readJson(USERS_FILE, []);
  const ranked = users
    .map(user => ({ id: user.id, username: user.username, stars: user.stars || 0 }))
    .sort((a, b) => b.stars - a.stars || a.username.localeCompare(b.username));
  res.json({ leaderboard: ranked.slice(0, 20) });
}));

// --- LEVELS ---

app.get('/api/levels', asyncHandler(async (req, res) => {
  const levels = await readJson(LEVELS_FILE, []);
  const sort = sanitizeString(String(req.query.sort || 'recent'), 20);
  res.json({ levels: sortLevels(levels, sort) });
}));

app.post('/api/levels', asyncHandler(async (req, res) => {
  const title = sanitizeString(req.body?.title, 60);
  const description = sanitizeString(req.body?.description, 300);
  const creator = sanitizeString(req.body?.creator, 30);
  const difficulty = sanitizeString(req.body?.difficulty, 30);
  const data = req.body?.data;

  if (!title || title.length < 1) {
    return res.status(400).json({ error: 'A level title is required!' });
  }
  if (!creator) {
    return res.status(400).json({ error: 'Creator name is required!? This shouldn\'t normally show up...' });
  }
  if (!data) {
    return res.status(400).json({ error: 'Level data is required!' });
  }

  // Validate level data format (should be string or object)
  let levelData = data;
  if (typeof data === 'object') {
    levelData = JSON.stringify(data);
  }

  const levels = await readJson(LEVELS_FILE, []);
  const level = {
    id: makeId('level'),
    title,
    description,
    creator,
    data: levelData,
    difficulty: difficulty || 'Unranked',
    rating: 0,
    ratings: 0,
    likes: 0,
    downloads: 0,
    createdAt: new Date().toISOString(),
  };

  levels.push(level);
  await writeJsonAtomic(LEVELS_FILE, levels);
  res.status(201).json({ level });
}));

// Search MUST come before /:id
app.get('/api/levels/search', asyncHandler(async (req, res) => {
  const q = sanitizeString(String(req.query.q || ''), 100);
  const sort = sanitizeString(String(req.query.sort || 'recent'), 20);
  const levels = await readJson(LEVELS_FILE, []);

  if (!q) {
    return res.json({ levels: sortLevels(levels, sort) });
  }

  const qLower = q.toLowerCase();
  const match = levels.filter(level => {
    const haystack = `${level.title} ${level.creator} ${level.description}`.toLowerCase();
    return haystack.includes(qLower);
  });
  res.json({ levels: sortLevels(match, sort) });
}));

app.get('/api/levels/:id', asyncHandler(async (req, res) => {
  const levels = await readJson(LEVELS_FILE, []);
  const level = levels.find(l => l.id === req.params.id);
  if (!level) return res.status(404).json({ error: 'Level not found' });
  res.json({ level });
}));

// Rate a level
app.post('/api/levels/:id/rate', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const moderator = sanitizeString(req.body?.moderator, 30);
  const verdict = sanitizeString(req.body?.verdict, 20);
  const stars = Number(req.body?.stars) || 0;

  if (!moderator || !verdict) {
    return res.status(400).json({ error: 'Moderator and verdict are required!' });
  }
  if (!['approved', 'rejected'].includes(verdict)) {
    return res.status(400).json({ error: 'Verdict must be "approved" or "rejected"' });
  }

  const levels = await readJson(LEVELS_FILE, []);
  const level = levels.find(entry => entry.id === id);
  if (!level) {
    return res.status(404).json({ error: 'Level not found' });
  }

  level.rating = verdict === 'approved' ? 1 : 0;
  level.ratings = (level.ratings || 0) + 1;
  level.moderator = moderator;
  level.verdict = verdict;

  // Award stars to the level CREATOR (not the moderator), based on the
  // level's declared difficulty rather than trusting the client's number. IDK will prob improve later.
  if (verdict === 'approved') {
    const rewardStars = starsForDifficulty(level.difficulty, Math.min(stars, 10) || 1);
    const users = await readJson(USERS_FILE, []);
    const creator = users.find(entry => entry.username.toLowerCase() === level.creator.toLowerCase());
    if (creator) {
      creator.stars = (creator.stars || 0) + rewardStars;
      await writeJsonAtomic(USERS_FILE, users);
    }
  }

  await writeJsonAtomic(LEVELS_FILE, levels);
  res.json({ level });
}));

// Complete a level
app.post('/api/levels/:id/complete', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const username = sanitizeString(String(req.body?.username || ''), 30);
  const rewardStars = Math.min(Math.max(Number(req.body?.rewardStars) || 0, 0), 10);

  // TODO: check if already completed
  // TODO: limit rewardStars
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
    // xd
  }

  const users = await readJson(USERS_FILE, []);
  const user = users.find(entry => entry.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  user.stars = (user.stars || 0) + rewardStars;
  await writeJsonAtomic(USERS_FILE, users);
  res.json({ user: sanitizeUser(user) });
}));

// Like a level
app.post('/api/levels/:id/like', asyncHandler(async (req, res) => {
  const levels = await readJson(LEVELS_FILE, []);
  const level = levels.find(l => l.id === req.params.id);
  if (!level) {
    return res.status(404).json({ error: 'Level not found' });
  }

  level.likes = (level.likes || 0) + 1;
  await writeJsonAtomic(LEVELS_FILE, levels);
  res.json({ success: true, likes: level.likes });

  // TODO: Limit likes per user (1)
}));

// Track a download/play of a level
app.post('/api/levels/:id/download', asyncHandler(async (req, res) => {
  const levels = await readJson(LEVELS_FILE, []);
  const level = levels.find(l => l.id === req.params.id);
  if (!level) {
    return res.status(404).json({ error: 'Level not found' });
  }

  level.downloads = (level.downloads || 0) + 1;
  await writeJsonAtomic(LEVELS_FILE, levels);
  res.json({ success: true, downloads: level.downloads });
}));

// Public profile lookup
app.get('/api/users/:username', asyncHandler(async (req, res) => {
  const username = sanitizeString(req.params.username, 30);
  const users = await readJson(USERS_FILE, []);
  const user = users.find(entry => entry.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const levels = await readJson(LEVELS_FILE, []);
  const created = levels.filter(l => l.creator.toLowerCase() === username.toLowerCase());
  res.json({
    user: sanitizeUser(user),
    levelsPublished: created.length,
    levelsApproved: created.filter(l => l.verdict === 'approved').length,
  });
}));

// Get comments for a level
app.get('/api/levels/:id/comments', asyncHandler(async (req, res) => {
  const comments = await readJson(COMMENTS_FILE, {});
  res.json({ comments: comments[req.params.id] || [] });
}));

// Post a comment
app.post('/api/levels/:id/comments', asyncHandler(async (req, res) => {
  const username = sanitizeString(req.body?.username, 30);
  const text = sanitizeString(req.body?.text, 500);

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }
  if (!text || text.length < 1) {
    return res.status(400).json({ error: 'Comment text is required' });
  }

  const comments = await readJson(COMMENTS_FILE, {});
  if (!comments[req.params.id]) comments[req.params.id] = [];

  const newComment = {
    id: makeId('cmt'),
    username,
    text,
    date: Date.now(),
  };

  comments[req.params.id].unshift(newComment);

  // Limit comments per level to 200
  if (comments[req.params.id].length > 200) {
    comments[req.params.id] = comments[req.params.id].slice(0, 200);
  }

  await writeJsonAtomic(COMMENTS_FILE, comments);
  res.json({ success: true, comment: newComment });
}));

// --- Global error handler ---
app.use((err, _req, res, _next) => {
  console.error('Something went wrong...', err.message);
  res.status(500).json({ error: 'Something went wrong...' });
});

app.listen(PORT, () => {
  console.log(`\nGeometryHTML running at http://localhost:${PORT}\n`);
});