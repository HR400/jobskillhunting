/**
 * DEV SMOKE — public/js/smoke.js (Ticket 31).
 *
 * Drives register → login → me → ranked match list through the API client and
 * prints each response. Manual harness, not part of the product UI.
 */
import { api, ApiError } from './api.js';

const out = document.getElementById('out');
const log = (label, value) => {
  out.textContent += `\n${label}: ${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}`;
};

document.getElementById('f').addEventListener('submit', async (event) => {
  event.preventDefault();
  out.textContent = '—';
  const form = new FormData(event.target);
  const email = String(form.get('email')).trim();
  const password = String(form.get('password'));

  try {
    log('register', await api.post('/auth/register', {
      role: 'candidate',
      email,
      password,
      profile: { candidate_type: 'fresher', fname: 'Smoke', lname: 'User' },
    }));
  } catch (err) {
    if (err instanceof ApiError && err.code === 'CONFLICT') {
      log('register', 'already registered — continuing to login');
    } else {
      log('register FAILED', err);
      return;
    }
  }

  try {
    log('login', await api.post('/auth/login', { email, password }));
    log('me', await api.get('/auth/me'));
    const me = await api.get('/auth/me');
    log(`ranked (${me.profileId})`, await api.get(`/match/candidate/${me.profileId}/jobs`));
  } catch (err) {
    log('FAILED', err);
  }
});

document.getElementById('logout').addEventListener('click', async () => {
  try {
    await api.post('/auth/logout');
    log('logout', '204 — cookie cleared');
  } catch (err) {
    log('FAILED', err);
  }
});
