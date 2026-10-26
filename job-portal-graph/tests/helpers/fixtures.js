/**
 * TEST ONLY — tests/helpers/fixtures.js (Ticket 13)
 *
 * Helpers to construct isolated graph fixtures in the throwaway test database.
 * Never connects to or mutates the runtime database.
 */
import { randomUUID } from 'node:crypto';
import { getTestDriver, wipeTestDb } from './db.js';
import { hashPassword } from '../../src/lib/auth.js';

export { wipeTestDb };

/**
 * Creates a test account and candidate profile directly on the test database.
 */
export async function createTestCandidate(driver, {
  email = `candidate-${randomUUID()}@example.com`,
  password = 'password123',
  candidateType = 'fresher',
  fname = 'Test',
  lname = 'Candidate',
  gradYear = 2024,
  hourlyRate = 50,
  totalExp = 3,
  currentCompany = 'TechCorp',
} = {}) {
  const accountId = randomUUID();
  const profileId = randomUUID();
  const passwordHash = await hashPassword(password);

  const session = driver.session({ database: 'neo4j' });
  try {
    let typeSpecificQuery = '';
    if (candidateType === 'freelancer') {
      typeSpecificQuery = `
        SET c:Freelancer, c.hourly_rate = $hourlyRate, c.portfolio_url = 'https://portfolio.test'
      `;
    } else if (candidateType === 'fresher') {
      typeSpecificQuery = `
        SET c:Fresher, c.grad_year = $gradYear
      `;
    } else {
      typeSpecificQuery = `
        SET c:Experienced, c.total_exp = $totalExp, c.current_company = $currentCompany
      `;
    }

    await session.executeWrite((tx) =>
      tx.run(
        `
        CREATE (a:Account {
          account_id: $accountId,
          email: $email,
          password_hash: $passwordHash,
          role: 'candidate',
          created_at: datetime()
        })
        CREATE (c:Candidate {
          cand_id: $profileId,
          fname: $fname,
          lname: $lname,
          dob: date('2000-01-01'),
          gender: 'prefer_not_to_say',
          reg_date: date('2024-01-01'),
          house_no: '123',
          street: 'Main Street',
          email: $email,
          phone: '+1234567890'
        })
        ${typeSpecificQuery}
        CREATE (a)-[:OWNS_PROFILE]->(c)
        RETURN a, c
        `,
        {
          accountId,
          profileId,
          email,
          passwordHash,
          fname,
          lname,
          gradYear,
          hourlyRate,
          totalExp,
          currentCompany,
        },
      ),
    );
    return { accountId, profileId, email, password, role: 'candidate' };
  } finally {
    await session.close();
  }
}

/**
 * Creates a test employer account and profile.
 */
export async function createTestEmployer(driver, {
  email = `employer-${randomUUID()}@example.com`,
  password = 'password123',
  companyName = 'Acme Corp',
} = {}) {
  const accountId = randomUUID();
  const profileId = randomUUID();
  const passwordHash = await hashPassword(password);

  const session = driver.session({ database: 'neo4j' });
  try {
    await session.executeWrite((tx) =>
      tx.run(
        `
        CREATE (a:Account {
          account_id: $accountId,
          email: $email,
          password_hash: $passwordHash,
          role: 'employer',
          created_at: datetime()
        })
        CREATE (e:Employer {
          emp_id: $profileId,
          company_name: $companyName,
          email: $email,
          website: 'https://acme.test',
          headquarters: 'Test City'
        })
        CREATE (a)-[:OWNS_PROFILE]->(e)
        RETURN a, e
        `,
        { accountId, profileId, email, passwordHash, companyName },
      ),
    );
    return { accountId, profileId, email, password, role: 'employer' };
  } finally {
    await session.close();
  }
}
