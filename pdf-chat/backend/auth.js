const { getDb } = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SECRET = process.env.JWT_SECRET || 'ragpdfchat_fallback_secret';

function makeToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), name: user.name, email: user.email },
    SECRET,
    { expiresIn: '7d' }
  );
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const action = (event.queryStringParameters || {}).action || '';

  try {
    const db = await getDb();
    const users = db.collection('users');
    const body = JSON.parse(event.body || '{}');

    // ── REGISTER ──
    if (action === 'register') {
      const { name, email, password } = body;
      if (!name || !email || !password)
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'All fields are required.' }) };
      if (password.length < 6)
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Password must be at least 6 characters.' }) };

      const existing = await users.findOne({ email: email.toLowerCase() });
      if (existing)
        return { statusCode: 409, headers: CORS, body: JSON.stringify({ error: 'This email is already registered.' }) };

      const hash = await bcrypt.hash(password, 12);
      const result = await users.insertOne({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hash,
        createdAt: new Date(),
      });

      const user = { _id: result.insertedId, name: name.trim(), email: email.toLowerCase().trim() };
      const token = makeToken(user);
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, user: { name: user.name, email: user.email } }),
      };
    }

    // ── LOGIN ──
    if (action === 'login') {
      const { email, password } = body;
      if (!email || !password)
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Email and password are required.' }) };

      const user = await users.findOne({ email: email.toLowerCase().trim() });
      if (!user)
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid email or password.' }) };

      const valid = await bcrypt.compare(password, user.password);
      if (!valid)
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid email or password.' }) };

      const token = makeToken(user);
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, user: { name: user.name, email: user.email } }),
      };
    }

    // ── VERIFY (check token validity) ──
    if (action === 'verify') {
      const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
      const token = authHeader.replace('Bearer ', '').trim();
      if (!token) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'No token' }) };
      try {
        const decoded = jwt.verify(token, SECRET);
        return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ valid: true, user: decoded }) };
      } catch {
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ valid: false, error: 'Token expired or invalid' }) };
      }
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown action.' }) };
  } catch (err) {
    console.error('auth error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server error: ' + err.message }) };
  }
};
