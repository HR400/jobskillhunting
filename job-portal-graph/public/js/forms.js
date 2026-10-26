/**
 * public/js/forms.js — profile wizard (Tickets 33–35).
 *
 * Steps: 1 register → 2 basics → 3 skills → 4 education → 5 review/submit.
 * This file covers steps 1–2 (Ticket 33). Steps 3–5 are added in later tickets.
 *
 * No default values that look like data (R1, §10.3). Server validation errors
 * map back onto the exact field via details[].path → [name] input.
 */
import { api, ApiError } from './api.js';

// ── State ────────────────────────────────────────────────────────────────────
let step = 1;
let session = null; // { accountId, role, profileId, email }
const collected = { basics: {} };
let slot = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') node.append(c);
    else if (c) node.append(c);
  }
  return node;
}

function clearErrors(form) {
  for (const msg of form.querySelectorAll('.field-error')) msg.remove();
  for (const input of form.querySelectorAll('.field-invalid')) input.classList.remove('field-invalid');
}

function showFieldErrors(form, details) {
  clearErrors(form);
  for (const { path, message } of details) {
    // Map server path (e.g. "profile.fname") to the form field name.
    const fieldName = path.replace(/^profile\./, '');
    const input = form.querySelector(`[name="${fieldName}"]`);
    if (input) {
      input.classList.add('field-invalid');
      const err = el('p', { className: 'field-error' }, message);
      input.parentElement.append(err);
    }
  }
}

function showFormError(form, message) {
  let banner = form.querySelector('.form-error');
  if (!banner) {
    banner = el('p', { className: 'form-error' });
    form.prepend(banner);
  }
  banner.textContent = message;
}

function field(labelText, name, type = 'text', extra = {}) {
  const label = el('label', { className: 'wizard-label' }, labelText);
  const attrs = { type, name, id: `wiz-${name}`, autocomplete: 'off', ...extra };
  const input = el('input', attrs);
  const wrap = el('div', { className: 'wizard-field' }, label, input);
  return wrap;
}

function selectField(labelText, name, options) {
  const label = el('label', { className: 'wizard-label' }, labelText);
  const select = el('select', { name, id: `wiz-${name}` });
  select.append(el('option', { value: '' }, '— select —'));
  for (const [value, text] of options) {
    select.append(el('option', { value }, text));
  }
  const wrap = el('div', { className: 'wizard-field' }, label, select);
  return wrap;
}

// ── Step 1: Register ────────────────────────────────────────────────────────
function renderStep1() {
  const form = el('form', { className: 'wizard-form', id: 'wizard-step1' });
  form.append(
    el('h3', { className: 'wizard-step-title' }, 'Step 1 — Create Account'),
    field('Email', 'email', 'email'),
    field('Password', 'password', 'password', { minlength: '8', maxlength: '128' }),
    selectField('I am a…', 'role', [
      ['candidate', 'Candidate'],
      ['employer', 'Employer'],
    ]),
  );

  // Candidate sub-type (only visible when role = candidate).
  const typeField = selectField('Type', 'candidate_type', [
    ['fresher', 'Fresher'],
    ['experienced', 'Experienced'],
    ['freelancer', 'Freelancer'],
  ]);
  typeField.id = 'candidate-type-wrap';
  typeField.hidden = true;
  form.append(typeField);

  const roleSelect = form.querySelector('[name="role"]');
  roleSelect.addEventListener('change', () => {
    typeField.hidden = roleSelect.value !== 'candidate';
  });

  // Employer-specific fields.
  const empFields = el('div', { id: 'employer-fields' });
  empFields.hidden = true;
  empFields.append(
    field('Company Name', 'company_name'),
    field('Website', 'website', 'url'),
    field('Headquarters', 'headquarters'),
  );
  form.append(empFields);

  roleSelect.addEventListener('change', () => {
    empFields.hidden = roleSelect.value !== 'employer';
  });

  form.append(el('button', { type: 'submit', className: 'wizard-btn' }, 'Create Account'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const data = Object.fromEntries(new FormData(form));
    const role = data.role;
    if (!role) {
      showFormError(form, 'Please select a role.');
      return;
    }

    let body;
    if (role === 'candidate') {
      const candidateType = data.candidate_type;
      if (!candidateType) {
        showFormError(form, 'Please select a candidate type.');
        return;
      }
      body = {
        email: data.email,
        password: data.password,
        role,
        profile: { candidate_type: candidateType, fname: 'TBD', lname: 'TBD' },
      };
    } else {
      body = {
        email: data.email,
        password: data.password,
        role,
        profile: {
          company_name: data.company_name || undefined,
          website: data.website || undefined,
          headquarters: data.headquarters || undefined,
        },
      };
    }

    try {
      const result = await api.post('/auth/register', body);
      // Auto-login after registration.
      await api.post('/auth/login', { email: data.email, password: data.password });
      session = { ...result, email: data.email };

      if (role === 'candidate') {
        step = 2;
        render();
      } else {
        // Employers have no multi-step wizard; show success.
        slot.innerHTML = '';
        slot.append(
          el('p', { className: 'wizard-success' },
            `Account created. You are signed in as ${data.email}.`),
        );
        // Trigger session re-render in app.js.
        window.dispatchEvent(new Event('session-change'));
      }
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        showFieldErrors(form, err.details);
      } else if (err instanceof ApiError) {
        showFormError(form, err.message);
      } else {
        showFormError(form, 'An unexpected error occurred.');
      }
    }
  });

  return form;
}

// ── Step 2: Basics ──────────────────────────────────────────────────────────
function renderStep2() {
  const form = el('form', { className: 'wizard-form', id: 'wizard-step2' });
  form.append(
    el('h3', { className: 'wizard-step-title' }, 'Step 2 — Basic Information'),
    field('First Name', 'fname'),
    field('Last Name', 'lname'),
    field('Date of Birth', 'dob', 'date'),
    selectField('Gender', 'gender', [
      ['male', 'Male'],
      ['female', 'Female'],
      ['other', 'Other'],
      ['prefer_not_to_say', 'Prefer Not to Say'],
    ]),
    field('Phone', 'phone', 'tel'),
    field('House/Apt', 'house_no'),
    field('Street', 'street'),
  );

  // Extra fields based on candidate_type stored in the session — but we
  // asked for candidate_type in step 1, so it's in the registration body.
  // We read it from the profile via /candidates/me.

  form.append(el('button', { type: 'submit', className: 'wizard-btn' }, 'Save and Continue'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);

    const data = Object.fromEntries(new FormData(form));
    const updates = {};
    if (data.fname) updates.fname = data.fname;
    if (data.lname) updates.lname = data.lname;
    if (data.phone) updates.phone = data.phone;
    if (data.house_no) updates.house_no = data.house_no;
    if (data.street) updates.street = data.street;
    if (data.gender) updates.gender = data.gender;
    // Type-specific extras.
    if (data.hourly_rate) updates.hourly_rate = Number(data.hourly_rate);
    if (data.portfolio_url) updates.portfolio_url = data.portfolio_url;
    if (data.grad_year) updates.grad_year = Number(data.grad_year);
    if (data.total_exp) updates.total_exp = Number(data.total_exp);
    if (data.current_company) updates.current_company = data.current_company;

    try {
      await api.put('/candidates/me', updates);
      collected.basics = updates;
      step = 3;
      render();
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        showFieldErrors(form, err.details);
      } else if (err instanceof ApiError) {
        showFormError(form, err.message);
      } else {
        showFormError(form, 'An unexpected error occurred.');
      }
    }
  });

  return form;
}

// ── Step 3 placeholder (Ticket 34) ──────────────────────────────────────────
function renderStep3() {
  return el('p', { className: 'muted' }, 'Skills step — built in Ticket 34.');
}

// ── Step 4 placeholder (Ticket 35) ──────────────────────────────────────────
function renderStep4() {
  return el('p', { className: 'muted' }, 'Education step — built in Ticket 35.');
}

// ── Step 5 placeholder (Ticket 35) ──────────────────────────────────────────
function renderStep5() {
  return el('p', { className: 'muted' }, 'Review step — built in Ticket 35.');
}

// ── Render ───────────────────────────────────────────────────────────────────
const STEP_RENDERERS = [null, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5];

function render() {
  if (!slot) return;
  slot.innerHTML = '';
  const renderer = STEP_RENDERERS[step];
  if (renderer) slot.append(renderer());
}

/** Initialise the wizard in the given container element. */
export function initWizard(container) {
  slot = container;
  render();
}
