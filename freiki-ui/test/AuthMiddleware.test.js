const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long';
process.env.VLLM_URL = process.env.VLLM_URL || 'http://vllm:8000';
process.env.VLLM_API_KEY = process.env.VLLM_API_KEY || 'test';
process.env.PG_PASS_KB = process.env.PG_PASS_KB || 'test';

const { signToken, getSession, adminSession } = require('../src/core/auth/AuthMiddleware');

const user = { id: 42, username: 'm.mustermann', role: 'default', use_areas: ['a'], manage_areas: [] };
const admin = { id: 1, username: 'admin', role: 'admin', use_areas: [], manage_areas: [] };

test('getSession: liest ein gueltiges Token aus dem freiki_session-Cookie', () => {
  const token = signToken(user);
  const session = getSession({ cookies: { freiki_session: token } });
  assert.equal(session.uid, user.id);
  assert.equal(session.username, user.username);
  assert.equal(session.role, user.role);
});

test('getSession: null ohne Cookie', () => {
  assert.equal(getSession({ cookies: {} }), null);
  assert.equal(getSession({ cookies: undefined }), null);
  assert.equal(getSession({}), null);
});

test('getSession: null bei manipuliertem/ungueltigem Token', () => {
  const token = signToken(user);
  const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
  assert.equal(getSession({ cookies: { freiki_session: tampered } }), null);
  assert.equal(getSession({ cookies: { freiki_session: 'not-a-jwt' } }), null);
});

test('getSession: ignoriert einen Authorization-Header (kein Bearer-Fallback mehr)', () => {
  const token = signToken(user);
  const session = getSession({ cookies: {}, headers: { authorization: `Bearer ${token}` } });
  assert.equal(session, null);
});

test('adminSession: liefert die Session nur bei role=admin', () => {
  const adminToken = signToken(admin);
  const userToken = signToken(user);
  assert.ok(adminSession({ cookies: { freiki_session: adminToken } }));
  assert.equal(adminSession({ cookies: { freiki_session: userToken } }), null);
  assert.equal(adminSession({ cookies: {} }), null);
});
