const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { config } = require('../../shared/config');
const { getBrandConfig } = require('../../shared/config/BrandConfig');
const creds = require('./WebauthnCredentialRepository');

const rpID = new URL(config.APP_URL).hostname;
const origin = config.APP_URL;

// Challenge lebt nur zwischen "Optionen anfordern" und "Antwort verifizieren" - Prozessspeicher
// reicht (Single-Instance-App, kein Redis im Stack), TTL analog zum Pending-Login-Token (5 Min).
const challenges = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function stashChallenge(uid, challenge) {
  challenges.set(uid, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

function popChallenge(uid) {
  const entry = challenges.get(uid);
  challenges.delete(uid);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.challenge;
}

function toAllowedCredential(row) {
  return { id: row.credential_id, transports: row.transports || undefined };
}

async function getRegistrationOptions(uid, username) {
  const existing = await creds.listByUser(uid);
  const options = await generateRegistrationOptions({
    rpName: getBrandConfig().name,
    rpID,
    userID: Buffer.from(String(uid)),
    userName: username,
    attestationType: 'none',
    excludeCredentials: existing.map(toAllowedCredential),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required', // erzwingt Geräte-PIN/Biometrie statt nur "Gerät entsperrt"
    },
  });
  stashChallenge(uid, options.challenge);
  return options;
}

async function verifyRegistration(uid, response, nickname) {
  const expectedChallenge = popChallenge(uid);
  if (!expectedChallenge) return { error: 'challenge-expired' };

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID,
    });
  } catch (e) {
    return { error: 'verification-failed', message: e.message };
  }
  if (!verification.verified || !verification.registrationInfo) return { error: 'not-verified' };

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  await creds.create({
    userId: uid,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    transports: credential.transports || [],
    nickname,
  });
  return { ok: true };
}

async function getAuthenticationOptions(uid) {
  const existing = await creds.listByUser(uid);
  if (!existing.length) return { error: 'no-passkeys' };
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: existing.map(toAllowedCredential),
    userVerification: 'required',
  });
  stashChallenge(uid, options.challenge);
  return options;
}

async function verifyAuthentication(uid, response) {
  const expectedChallenge = popChallenge(uid);
  if (!expectedChallenge) return { error: 'challenge-expired' };

  const row = await creds.findByCredentialId(response.id);
  if (!row || row.user_id !== uid) return { error: 'unknown-credential' };

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID,
      credential: {
        id: row.credential_id,
        publicKey: Buffer.from(row.public_key, 'base64url'),
        counter: Number(row.counter),
        transports: row.transports || undefined,
      },
    });
  } catch (e) {
    return { error: 'verification-failed', message: e.message };
  }
  if (!verification.verified) return { error: 'not-verified' };

  await creds.updateCounter(row.credential_id, verification.authenticationInfo.newCounter);
  return { ok: true };
}

module.exports = { getRegistrationOptions, verifyRegistration, getAuthenticationOptions, verifyAuthentication };
