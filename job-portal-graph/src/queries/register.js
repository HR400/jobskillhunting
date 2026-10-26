/**
 * src/queries/register.js — one atomic statement per account kind.
 *
 * Account + role profile + OWNS_PROFILE are created by the same statement, so a
 * failure anywhere leaves nothing behind. Labels are literals; values are
 * parameters. Optional properties arrive as null and are therefore not stored.
 */
const account = `CREATE (a:Account {
  account_id: $accountId,
  email: $email,
  password_hash: $passwordHash,
  role: $role,
  created_at: datetime()
})`;

const own = `CREATE (a)-[:OWNS_PROFILE]->(p)`;

const candidate = (labels, extra = '') => `${account}
CREATE (p:${labels} {
  cand_id: $profileId,
  fname: $fname,
  lname: $lname,
  dob: CASE WHEN $dob IS NULL THEN null ELSE date($dob) END,
  gender: $gender,
  house_no: $house_no,
  street: $street,
  email: $email,
  phone: $phone,
  reg_date: date()${extra}
})
${own}`;

const roleProfile = (label, id, fields) => `${account}
CREATE (p:${label} { ${id}: $profileId, ${fields} })
${own}`;

export const REGISTER_QUERIES = {
  freelancer: {
    name: 'register.freelancer',
    cypher: candidate(
      'Candidate:Freelancer',
      `,\n  hourly_rate: $hourly_rate,\n  portfolio_url: $portfolio_url`,
    ),
  },
  fresher: {
    name: 'register.fresher',
    cypher: candidate('Candidate:Fresher', `,\n  grad_year: $grad_year`),
  },
  experienced: {
    name: 'register.experienced',
    cypher: candidate(
      'Candidate:Experienced',
      `,\n  total_exp: $total_exp,\n  current_company: $current_company`,
    ),
  },
  employer: {
    name: 'register.employer',
    cypher: roleProfile(
      'Employer',
      'emp_id',
      'company_name: $company_name, email: $email, website: $website, headquarters: $headquarters',
    ),
  },
  recruiter: {
    name: 'register.recruiter',
    cypher: roleProfile(
      'Recruiter',
      'rec_id',
      'agency_name: $agency_name, lic_no: $lic_no',
    ),
  },
};
