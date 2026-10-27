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

  // Candidate fields (visible when role = candidate).
  const candFields = el('div', { id: 'candidate-fields' });
  candFields.hidden = true;
  candFields.append(
    selectField('Type', 'candidate_type', [
      ['fresher', 'Fresher'],
      ['experienced', 'Experienced'],
      ['freelancer', 'Freelancer'],
    ]),
    field('First Name', 'fname'),
    field('Last Name', 'lname'),
  );
  form.append(candFields);

  const roleSelect = form.querySelector('[name="role"]');
  roleSelect.addEventListener('change', () => {
    candFields.hidden = roleSelect.value !== 'candidate';
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
        profile: {
          candidate_type: candidateType,
          fname: data.fname,
          lname: data.lname,
        },
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
        collected.candidate_type = data.candidate_type;
        collected.fname = data.fname;
        collected.lname = data.lname;
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
    field('First Name', 'fname', 'text', { value: collected.fname || '' }),
    field('Last Name', 'lname', 'text', { value: collected.lname || '' }),
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

  // Extra fields based on candidate_type.
  const candType = collected.candidate_type;
  if (candType === 'freelancer') {
    form.append(
      field('Hourly Rate ($)', 'hourly_rate', 'number', { min: '0', max: '100000', step: 'any' }),
      field('Portfolio URL', 'portfolio_url', 'url', { placeholder: 'https://...' }),
    );
  } else if (candType === 'fresher') {
    form.append(
      field('Graduation Year', 'grad_year', 'number', { min: '1950', max: '2100' }),
    );
  } else if (candType === 'experienced') {
    form.append(
      field('Total Experience (years)', 'total_exp', 'number', { min: '0', max: '60', step: '0.5' }),
      field('Current Company', 'current_company', 'text', { maxlength: '100' }),
    );
  }

  form.append(el('button', { type: 'submit', className: 'wizard-btn' }, 'Save and Continue'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);

    const data = Object.fromEntries(new FormData(form));
    const updates = {};
    if (data.fname) updates.fname = data.fname;
    if (data.lname) updates.lname = data.lname;
    if (data.dob) updates.dob = data.dob;
    if (data.gender) updates.gender = data.gender;
    if (data.phone) updates.phone = data.phone;
    if (data.house_no) updates.house_no = data.house_no;
    if (data.street) updates.street = data.street;
    // Type-specific extras.
    if (data.hourly_rate !== '' && data.hourly_rate !== undefined) updates.hourly_rate = Number(data.hourly_rate);
    if (data.portfolio_url) updates.portfolio_url = data.portfolio_url;
    if (data.grad_year !== '' && data.grad_year !== undefined) updates.grad_year = Number(data.grad_year);
    if (data.total_exp !== '' && data.total_exp !== undefined) updates.total_exp = Number(data.total_exp);
    if (data.current_company) updates.current_company = data.current_company;

    try {
      await api.put('/candidates/me', updates);
      collected.basics = { ...collected.basics, ...updates };
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

// ── Step 3: Skills (Ticket 34) ──────────────────────────────────────────────
const PROFICIENCY_LABELS = ['', 'Beginner', 'Basic', 'Intermediate', 'Advanced', 'Expert'];

function renderStep3() {
  if (!collected.skills) collected.skills = [];

  const wrap = el('div', { className: 'wizard-form', id: 'wizard-step3' });
  wrap.append(el('h3', { className: 'wizard-step-title' }, 'Step 3 — Skills'));

  // ── Skill list ─────────────────────────────────────────────────────────────
  const listEl = el('div', { className: 'skill-list', id: 'skill-entries' });

  function renderSkillList() {
    listEl.innerHTML = '';
    for (let i = 0; i < collected.skills.length; i++) {
      const s = collected.skills[i];
      const row = el('div', { className: 'skill-row' },
        el('span', { className: 'skill-name' }, s.name),
        el('span', { className: 'skill-prof' },
          `${PROFICIENCY_LABELS[s.proficiency]} (${s.proficiency}/5)`),
        el('span', { className: 'skill-years' }, `${s.years} yr`),
        el('button', {
          type: 'button',
          className: 'skill-remove',
          onClick: () => { collected.skills.splice(i, 1); renderSkillList(); },
        }, '×'),
      );
      listEl.append(row);
    }
  }

  renderSkillList();
  wrap.append(listEl);

  // ── Typeahead input ────────────────────────────────────────────────────────
  const searchWrap = el('div', { className: 'typeahead-wrap' });
  const searchInput = el('input', {
    type: 'text',
    name: 'skill_search',
    id: 'wiz-skill-search',
    placeholder: 'Search skills…',
    autocomplete: 'off',
  });
  const dropdown = el('ul', { className: 'typeahead-dropdown', id: 'skill-suggestions' });
  dropdown.hidden = true;
  searchWrap.append(searchInput, dropdown);
  wrap.append(searchWrap);

  let debounceTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = searchInput.value.trim();
    if (q.length < 1) { dropdown.hidden = true; return; }
    debounceTimer = setTimeout(async () => {
      try {
        const data = await api.get(`/skills?q=${encodeURIComponent(q)}`);
        const skills = data.skills || [];
        dropdown.innerHTML = '';
        for (const s of skills) {
          const li = el('li', {
            className: 'typeahead-option',
            onClick: () => { pickSkill(s.name, s.skill_key); dropdown.hidden = true; searchInput.value = ''; },
          }, s.name);
          dropdown.append(li);
        }
        // "Add new" option if the typed value is not in the list.
        const lowerQ = q.toLowerCase().replace(/\s+/g, ' ').trim();
        const exists = skills.some((s) => s.skill_key === lowerQ);
        if (!exists) {
          const addLi = el('li', {
            className: 'typeahead-option typeahead-add',
            onClick: () => confirmAdd(q),
          }, `Add "${q}" as a new skill…`);
          dropdown.append(addLi);
        }
        dropdown.hidden = dropdown.children.length === 0;
      } catch {
        dropdown.hidden = true;
      }
    }, 250);
  });

  // Hide dropdown when clicking outside.
  document.addEventListener('click', (e) => {
    if (!searchWrap.contains(e.target)) dropdown.hidden = true;
  });

  // ── Confirm-to-add for unknown skills ──────────────────────────────────────
  function confirmAdd(name) {
    dropdown.hidden = true;
    searchInput.value = '';
    const confirmed = window.confirm(
      `"${name}" is not in the catalogue. Add it as a new skill?`,
    );
    if (confirmed) pickSkill(name, null);
  }

  // ── Pick a skill → show proficiency/years form ─────────────────────────────
  const addFormWrap = el('div', { id: 'skill-add-form' });
  addFormWrap.hidden = true;
  wrap.append(addFormWrap);

  let pendingSkill = null;

  function pickSkill(name, skillKey) {
    pendingSkill = { name, skill_key: skillKey };
    addFormWrap.hidden = false;
    addFormWrap.innerHTML = '';

    const profLabel = el('span', { id: 'prof-label', className: 'wizard-label' },
      PROFICIENCY_LABELS[3]);
    addFormWrap.append(
      el('p', {}, `Adding: ${name}`),
      el('div', { className: 'wizard-field' },
        el('label', { className: 'wizard-label' }, 'Proficiency (1–5)'),
        (() => {
          const inp = el('input', {
            type: 'range', name: 'proficiency', min: '1', max: '5', value: '3',
            id: 'wiz-prof-range',
          });
          inp.addEventListener('input', () => { profLabel.textContent = PROFICIENCY_LABELS[inp.value]; });
          return inp;
        })(),
        profLabel,
      ),
      field('Years of experience', 'years', 'number', { min: '0', max: '60', step: '0.5' }),
      field('Last used year (optional)', 'last_used_year', 'number', {
        min: '1950', max: '2100', step: '1',
      }),
      el('button', {
        type: 'button',
        className: 'wizard-btn',
        onClick: () => {
          const prof = Number(addFormWrap.querySelector('[name="proficiency"]').value);
          const years = Number(addFormWrap.querySelector('[name="years"]').value) || 0;
          const luy = addFormWrap.querySelector('[name="last_used_year"]').value;
          collected.skills.push({
            name: pendingSkill.name,
            skill_key: pendingSkill.skill_key,
            proficiency: prof,
            years,
            last_used_year: luy ? Number(luy) : null,
          });
          addFormWrap.hidden = true;
          addFormWrap.innerHTML = '';
          renderSkillList();
        },
      }, 'Confirm Skill'),
    );
  }

  // ── Save and continue ──────────────────────────────────────────────────────
  const saveBtn = el('button', {
    type: 'button',
    className: 'wizard-btn',
    onClick: async () => {
      if (collected.skills.length === 0) {
        // Allow continuing with zero skills (R3: no-skills empty state).
        step = 4;
        render();
        return;
      }
      try {
        await api.put('/candidates/me/skills', { skills: collected.skills });
        window.dispatchEvent(new CustomEvent('session-change', { detail: session }));
        if (session) {
          await renderCandidateDashboard();
        } else {
          step = 4;
          render();
        }
      } catch (err) {
        if (err instanceof ApiError) {
          let banner = wrap.querySelector('.form-error');
          if (!banner) { banner = el('p', { className: 'form-error' }); wrap.prepend(banner); }
          banner.textContent = err.message;
        }
      }
    },
  }, 'Save Skills and Continue');
  wrap.append(saveBtn);

  return wrap;
}

// ── Step 4: Education & Location (Ticket 35) ─────────────────────────────────
function renderStep4() {
  if (!collected.education) collected.education = [];

  const wrap = el('div', { className: 'wizard-form', id: 'wizard-step4' });
  wrap.append(el('h3', { className: 'wizard-step-title' }, 'Step 4 — Education'));

  const listEl = el('div', { className: 'education-list', id: 'edu-entries' });

  function renderEduList() {
    listEl.innerHTML = '';
    for (let i = 0; i < collected.education.length; i++) {
      const e = collected.education[i];
      const row = el('div', { className: 'edu-row' },
        el('span', { className: 'edu-degree' }, `${e.degree} — ${e.university}`),
        el('span', { className: 'edu-years' }, `${e.start_year}${e.end_year ? '–' + e.end_year : ''}`),
        el('button', {
          type: 'button',
          className: 'skill-remove',
          onClick: async () => {
            if (e.edu_id) {
              try { await api.delete(`/candidates/me/education/${e.edu_id}`); } catch { /* ignore */ }
            }
            collected.education.splice(i, 1);
            renderEduList();
          },
        }, '×'),
      );
      listEl.append(row);
    }
  }

  renderEduList();
  wrap.append(listEl);

  const addForm = el('div', { id: 'edu-add-form' },
    field('Degree', 'degree', 'text', { placeholder: 'e.g. B.S. in Computer Science' }),
    field('University', 'university', 'text', { placeholder: 'e.g. Stanford University' }),
    field('Start Year', 'start_year', 'number', { min: '1950', max: '2100' }),
    field('End Year (optional)', 'end_year', 'number', { min: '1950', max: '2100' }),
    field('CGPA (optional)', 'cgpa', 'number', { min: '0', max: '10', step: '0.01' }),
    field('Specialization (optional)', 'specialization', 'text'),
    el('button', {
      type: 'button',
      className: 'wizard-btn',
      onClick: async () => {
        clearErrors(wrap);
        const degree = wrap.querySelector('[name="degree"]').value.trim();
        const university = wrap.querySelector('[name="university"]').value.trim();
        const startYearVal = wrap.querySelector('[name="start_year"]').value;
        const endYearVal = wrap.querySelector('[name="end_year"]').value;
        const cgpaVal = wrap.querySelector('[name="cgpa"]').value;
        const specialization = wrap.querySelector('[name="specialization"]').value.trim();

        if (!degree || !university || !startYearVal) {
          showFormError(wrap, 'Degree, university, and start year are required.');
          return;
        }

        const entry = {
          degree,
          university,
          start_year: Number(startYearVal),
          end_year: endYearVal ? Number(endYearVal) : null,
          cgpa: cgpaVal ? Number(cgpaVal) : null,
          specialization: specialization || null,
        };

        try {
          const res = await api.post('/candidates/me/education', entry);
          collected.education.push({ ...entry, edu_id: res.education?.edu_id || res.edu_id });
          wrap.querySelector('[name="degree"]').value = '';
          wrap.querySelector('[name="university"]').value = '';
          wrap.querySelector('[name="start_year"]').value = '';
          wrap.querySelector('[name="end_year"]').value = '';
          wrap.querySelector('[name="cgpa"]').value = '';
          wrap.querySelector('[name="specialization"]').value = '';
          renderEduList();
        } catch (err) {
          if (err instanceof ApiError && err.details?.length) {
            showFieldErrors(wrap, err.details);
          } else if (err instanceof ApiError) {
            showFormError(wrap, err.message);
          } else {
            showFormError(wrap, 'Failed to save education.');
          }
        }
      },
    }, 'Add Education'),
  );

  wrap.append(addForm);

  const nextBtn = el('button', {
    type: 'button',
    className: 'wizard-btn',
    onClick: () => {
      step = 5;
      render();
    },
  }, 'Continue to Review');
  wrap.append(nextBtn);

  return wrap;
}

// ── Step 5: Review & Submit (Ticket 35) ──────────────────────────────────────
function renderStep5() {
  const wrap = el('div', { className: 'wizard-form', id: 'wizard-step5' });
  wrap.append(el('h3', { className: 'wizard-step-title' }, 'Step 5 — Review & Submit'));

  const reviewCard = el('div', { className: 'review-card', id: 'wizard-review-summary' });

  // Account
  const accSection = el('div', { className: 'review-section' },
    el('h4', { className: 'review-title' }, 'Account'),
    el('p', {}, `Email: ${session?.email || '—'}`),
    el('p', {}, `Role: ${session?.role || 'candidate'}`),
    collected.candidate_type ? el('p', {}, `Candidate Type: ${collected.candidate_type}`) : null,
  );
  reviewCard.append(accSection);

  // Basics — only entered values
  const basics = collected.basics || {};
  const basicItems = [];
  const fullName = [basics.fname, basics.lname].filter(Boolean).join(' ');
  if (fullName) basicItems.push(el('p', {}, `Name: ${fullName}`));
  if (basics.dob) basicItems.push(el('p', {}, `Date of Birth: ${basics.dob}`));
  if (basics.gender) basicItems.push(el('p', {}, `Gender: ${basics.gender}`));
  if (basics.phone) basicItems.push(el('p', {}, `Phone: ${basics.phone}`));
  const address = [basics.house_no, basics.street].filter(Boolean).join(', ');
  if (address) basicItems.push(el('p', {}, `Address: ${address}`));

  // Candidate type extras
  if (basics.hourly_rate !== undefined && basics.hourly_rate !== null) {
    basicItems.push(el('p', {}, `Hourly Rate: $${basics.hourly_rate}`));
  }
  if (basics.portfolio_url) {
    basicItems.push(el('p', {}, `Portfolio: ${basics.portfolio_url}`));
  }
  if (basics.grad_year) {
    basicItems.push(el('p', {}, `Graduation Year: ${basics.grad_year}`));
  }
  if (basics.total_exp !== undefined && basics.total_exp !== null) {
    basicItems.push(el('p', {}, `Total Experience: ${basics.total_exp} yr`));
  }
  if (basics.current_company) {
    basicItems.push(el('p', {}, `Current Company: ${basics.current_company}`));
  }

  if (basicItems.length > 0) {
    reviewCard.append(el('div', { className: 'review-section' },
      el('h4', { className: 'review-title' }, 'Basic Information'),
      ...basicItems,
    ));
  }

  // Skills
  const skills = collected.skills || [];
  const skillElements = skills.length > 0
    ? skills.map((s) =>
        el('p', { className: 'review-entry' },
          `${s.name}: ${PROFICIENCY_LABELS[s.proficiency]} (${s.proficiency}/5) · ${s.years} yr${s.last_used_year ? ' · Last used ' + s.last_used_year : ''}`))
    : [el('p', { className: 'muted' }, 'No skills entered')];

  reviewCard.append(el('div', { className: 'review-section' },
    el('h4', { className: 'review-title' }, 'Skills'),
    ...skillElements,
  ));

  // Education
  const educations = collected.education || [];
  const eduElements = educations.length > 0
    ? educations.map((e) =>
        el('p', { className: 'review-entry' },
          `${e.degree} — ${e.university} (${e.start_year}${e.end_year ? '–' + e.end_year : ''})${e.cgpa ? ' · CGPA: ' + e.cgpa : ''}`))
    : [el('p', { className: 'muted' }, 'No education entered')];

  reviewCard.append(el('div', { className: 'review-section' },
    el('h4', { className: 'review-title' }, 'Education'),
    ...eduElements,
  ));

  wrap.append(reviewCard);

  // Submit button
  const submitBtn = el('button', {
    type: 'button',
    className: 'wizard-btn',
    onClick: () => {
      slot.innerHTML = '';
      slot.append(
        el('div', { className: 'wizard-success-card' },
          el('h3', { className: 'wizard-step-title' }, 'Profile Complete'),
          el('p', { className: 'wizard-success' },
            'Your profile is active and ready for matching.'),
        ),
      );
      window.dispatchEvent(new CustomEvent('session-change', { detail: session }));
      window.dispatchEvent(new CustomEvent('profile-ready', { detail: session }));
    },
  }, 'Complete Profile');
  wrap.append(submitBtn);

  return wrap;
}

// ── Render ───────────────────────────────────────────────────────────────────
const STEP_RENDERERS = [null, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5];

async function renderCandidateDashboard() {
  if (!slot) return;
  slot.innerHTML = '';
  const wrap = el('div', { className: 'profile-dashboard' });

  let profile = null;
  try {
    profile = await api.get('/candidates/me');
  } catch {
    // profile not completed yet
  }

  const name = profile ? `${profile.fname || ''} ${profile.lname || ''}`.trim() : session?.email;
  const candidateType = profile?.candidate_type ?? 'Candidate';

  const card = el('div', { className: 'profile-card' });
  card.append(
    el('h3', { className: 'profile-user-name' }, name || 'Your Profile'),
    el('span', { className: 'profile-role-badge' }, candidateType),
    el('p', { className: 'muted', style: 'margin: 0 0 var(--space-xs); font-size: var(--text-caption-size);' }, session?.email || ''),
  );

  // Held skills list
  const skillsTitle = el('h4', { className: 'wizard-step-title', style: 'font-size: var(--text-body-size); margin-top: var(--space-xs);' }, 'Skills');
  const skillsList = el('div', { className: 'profile-skills-list' });

  const heldSkills = profile?.skills || [];
  if (heldSkills.length > 0) {
    for (const s of heldSkills) {
      skillsList.append(
        el('span', { className: 'profile-skill-chip' },
          `${s.name || s.skill_key} · ${s.proficiency}/5 (${s.years}y)`),
      );
    }
  } else {
    skillsList.append(el('p', { className: 'muted', style: 'font-size: var(--text-caption-size); margin: 0;' }, 'No skills added yet. Add skills to see live graph matches!'));
  }

  const btnGroup = el('div', { style: 'display: flex; gap: var(--space-xs); margin-top: var(--space-md); flex-wrap: wrap;' });

  const manageSkillsBtn = el('button', {
    type: 'button',
    className: 'wizard-btn',
    onClick: () => {
      collected.skills = (profile?.skills || []).map(s => ({
        skill_key: s.skill_key,
        name: s.name || s.skill_key,
        proficiency: s.proficiency,
        years: s.years,
        last_used_year: s.last_used_year,
      }));
      step = 3;
      render();
    },
  }, heldSkills.length > 0 ? 'Edit Skills' : '+ Add Skills');

  const manageEduBtn = el('button', {
    type: 'button',
    className: 'wizard-btn-secondary',
    style: 'border: var(--border-hairline); border-radius: var(--radius-pill); background: var(--color-canvas); color: var(--color-page-text); padding: var(--space-xs) var(--space-md); cursor: pointer;',
    onClick: () => {
      step = 4;
      render();
    },
  }, '+ Add Education');

  btnGroup.append(manageSkillsBtn, manageEduBtn);
  card.append(skillsTitle, skillsList, btnGroup);
  wrap.append(card);
  slot.append(wrap);
}

function renderEmployerDashboard() {
  if (!slot) return;
  slot.innerHTML = '';
  const wrap = el('div', { className: 'profile-dashboard' });
  const card = el('div', { className: 'profile-card' });
  card.append(
    el('h3', { className: 'profile-user-name' }, 'Employer Portal'),
    el('p', { className: 'muted' }, session?.email || ''),
    el('p', {}, 'Switch to the Recruiter tab to view candidates for your posted jobs.'),
  );
  wrap.append(card);
  slot.append(wrap);
}

export async function setWizardSession(userSession) {
  session = userSession;
  if (!slot) return;
  if (!session) {
    step = 1;
    render();
    return;
  }
  if (session.role === 'candidate') {
    await renderCandidateDashboard();
  } else if (session.role === 'employer') {
    renderEmployerDashboard();
  }
}

function render() {
  if (!slot) return;
  slot.innerHTML = '';
  const renderer = STEP_RENDERERS[step];
  if (renderer) slot.append(renderer());
}

/** Initialise the wizard in the given container element. */
export function initWizard(container) {
  slot = container;
  if (session) {
    setWizardSession(session);
  } else {
    render();
  }
}

