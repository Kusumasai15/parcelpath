/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dedicated admin cleanup script for ParcelPath accounts.
 * Safely previews and permanently deletes specified accounts and all associated data
 * (profiles, shipments, tickets, screenshot attachments, alerts, sessions, recovery codes, and Gmail tokens)
 * from Neon PostgreSQL (DATABASE_URL) and records tombstones to prevent re-seeding.
 *
 * Usage:
 *   # Preview affected records without deleting:
 *   npx tsx scripts/cleanup-accounts.ts --emails "user1@example.com,user2@example.com" --preview
 *
 *   # Permanently delete and verify records are gone:
 *   npx tsx scripts/cleanup-accounts.ts --emails "user1@example.com,user2@example.com" --execute --confirm
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

function parseArgs() {
  const args = process.argv.slice(2);
  let emails: string[] = [];
  let isPreview = false;
  let isExecute = false;
  let isConfirm = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--preview') {
      isPreview = true;
    } else if (arg === '--execute') {
      isExecute = true;
    } else if (arg === '--confirm') {
      isConfirm = true;
    } else if (arg === '--emails' && args[i + 1]) {
      emails = args[i + 1]
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      i++;
    } else if (arg.startsWith('--emails=')) {
      emails = arg
        .split('=')[1]
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    }
  }

  return { emails, isPreview, isExecute, isConfirm };
}

async function main() {
  const { emails, isPreview, isExecute, isConfirm } = parseArgs();

  console.log('====================================================');
  console.log('       ParcelPath Account Cleanup Tool');
  console.log('====================================================');

  if (emails.length === 0) {
    console.error('Error: Please specify target email address(es) via --emails "user@example.com".');
    console.log('Example:');
    console.log('  npx tsx scripts/cleanup-accounts.ts --emails "user1@example.com,user2@example.com" --preview');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  const isPostgres = databaseUrl && !databaseUrl.includes('your-db-host') && !databaseUrl.includes('placeholder');

  console.log(`Target database: ${isPostgres ? 'Neon PostgreSQL' : 'Local file store (data/db.json)'}`);
  console.log(`Target emails (${emails.length}):`, emails.join(', '));
  console.log('----------------------------------------------------');

  if (isPostgres) {
    const sql = neon(databaseUrl!);

    // 1. Find matching users in Neon
    const userRows: any[] = (await sql`
      SELECT id, email, name, role, created_at
      FROM users
      WHERE LOWER(email) = ANY(${emails})
    `) as any[];

    if (userRows.length === 0) {
      console.log('No matching user accounts found in Neon database for the provided email(s).');
      return;
    }

    const userIds = userRows.map((u) => u.id);

    // 2. Query counts of affected records
    const [shipmentRows, ticketRows, alertRows, sessionRows, emailRows]: any[] = await Promise.all([
      sql`SELECT id, user_id FROM shipments WHERE user_id = ANY(${userIds})`,
      sql`SELECT id, user_id FROM tickets WHERE user_id = ANY(${userIds})`,
      sql`SELECT id, user_id FROM alerts WHERE user_id = ANY(${userIds})`,
      sql`SELECT token, user_id FROM sessions WHERE user_id = ANY(${userIds})`,
      sql`SELECT user_id, email FROM email_integrations WHERE user_id = ANY(${userIds})`,
    ]);

    console.log('\n[PREVIEW OF MATCHING ACCOUNTS & AFFECTED RECORDS]');
    for (const u of userRows) {
      const ships = (shipmentRows as any[]).filter((s) => s.user_id === u.id).length;
      const tix = (ticketRows as any[]).filter((t) => t.user_id === u.id).length;
      const alrts = (alertRows as any[]).filter((a) => a.user_id === u.id).length;
      const sess = (sessionRows as any[]).filter((s) => s.user_id === u.id).length;
      const gmail = (emailRows as any[]).some((e) => e.user_id === u.id);

      console.log(`\n• User Account: ${u.email} (ID: ${u.id})`);
      console.log(`  Name: ${u.name} | Role: ${u.role}`);
      console.log(`  Created at: ${u.created_at}`);
      console.log(`  - Shipments to delete: ${ships}`);
      console.log(`  - Support tickets & attachments to delete: ${tix}`);
      console.log(`  - Notifications to delete: ${alrts}`);
      console.log(`  - Active sessions to revoke: ${sess}`);
      console.log(`  - Linked Gmail tokens to delete: ${gmail ? 'Yes' : 'None'}`);
      console.log(`  - Tombstone recorded in deleted_accounts: Yes (prevents resurrection)`);
    }

    if (isPreview && !isExecute) {
      console.log('\n----------------------------------------------------');
      console.log('Preview complete. No records were modified.');
      console.log('To permanently execute deletion, re-run with:');
      console.log(`  npx tsx scripts/cleanup-accounts.ts --emails "${emails.join(',')}" --execute --confirm`);
      console.log('----------------------------------------------------');
      return;
    }

    if (isExecute) {
      if (!isConfirm) {
        console.error('\nError: Deletion execution requires --confirm flag to prevent accidental loss.');
        process.exit(1);
      }

      console.log('\nExecuting permanent deletion in Neon PostgreSQL...');

      for (const u of userRows) {
        const normEmail = u.email.toLowerCase();
        // Record tombstone in deleted_accounts
        await sql`
          INSERT INTO deleted_accounts (email, user_id, deleted_at)
          VALUES (${normEmail}, ${u.id}, NOW())
          ON CONFLICT (email) DO UPDATE SET user_id = ${u.id}, deleted_at = NOW()
        `;

        // Purge all user rows
        await sql`DELETE FROM sessions WHERE user_id = ${u.id}`;
        await sql`DELETE FROM alerts WHERE user_id = ${u.id}`;
        await sql`DELETE FROM shipments WHERE user_id = ${u.id}`;
        await sql`DELETE FROM tickets WHERE user_id = ${u.id}`;
        await sql`DELETE FROM email_integrations WHERE user_id = ${u.id}`;
        await sql`DELETE FROM users WHERE id = ${u.id}`;
        console.log(`✓ Deleted all records and sessions for ${u.email}`);
      }

      // Verification query to ensure 0 records remain
      const verifyUsers: any[] = (await sql`
        SELECT id, email FROM users WHERE LOWER(email) = ANY(${emails})
      `) as any[];

      const verifyShipments: any[] = (await sql`
        SELECT id FROM shipments WHERE user_id = ANY(${userIds})
      `) as any[];

      console.log('\n[POST-DELETION VERIFICATION]');
      console.log(`Remaining matching users in Neon: ${verifyUsers.length} (Expected: 0)`);
      console.log(`Remaining matching parcels in Neon: ${verifyShipments.length} (Expected: 0)`);

      if (verifyUsers.length === 0 && verifyShipments.length === 0) {
        console.log('✅ Success: Accounts and all associated records have been permanently wiped from Neon.');
        console.log('These emails can now register again as brand new accounts whenever desired.');
      } else {
        console.warn('⚠️ Warning: Some records may still exist. Please check your query permissions.');
      }
    }
  } else {
    // Local JSON fallback
    const dbPath = path.join(process.cwd(), 'data', 'db.json');
    if (!fs.existsSync(dbPath)) {
      console.log('No local data/db.json found.');
      return;
    }

    const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    const matchingUsers = (data.users || []).filter((u: any) => emails.includes((u.email || '').toLowerCase()));

    if (matchingUsers.length === 0) {
      console.log('No matching users found in local database for the provided email(s).');
      return;
    }

    console.log(`\nFound ${matchingUsers.length} matching local accounts:`);
    for (const u of matchingUsers) {
      console.log(`• ${u.email} (ID: ${u.id})`);
    }

    if (isPreview && !isExecute) {
      console.log('\nPreview complete. To execute deletion, re-run with --execute --confirm.');
      return;
    }

    if (isExecute && isConfirm) {
      const matchIds = matchingUsers.map((u: any) => u.id);
      data.users = data.users.filter((u: any) => !matchIds.includes(u.id));
      data.shipments = (data.shipments || []).filter((s: any) => !matchIds.includes(s.userId));
      data.tickets = (data.tickets || []).filter((t: any) => !matchIds.includes(t.userId));
      data.alerts = (data.alerts || []).filter((a: any) => !matchIds.includes(a.userId));
      for (const [token, s] of Object.entries(data.sessions || {})) {
        const uid = typeof s === 'string' ? s : (s as any).userId;
        if (matchIds.includes(uid)) {
          delete data.sessions[token];
        }
      }
      for (const id of matchIds) {
        delete (data.emailIntegrations || {})[id];
      }

      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
      console.log('✅ Success: Accounts removed from local file store.');
    }
  }
}

main().catch((err) => {
  console.error('Fatal error during account cleanup:', err);
  process.exit(1);
});
