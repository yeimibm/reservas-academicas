'use client';

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: string;
};

export type SessionData = {
  accessToken: string;
  user: SessionUser;
};

const SESSION_KEY = 'academic_reservations_session';

export function saveSession(session: SessionData) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): SessionData | null {
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}
