import { neon, Pool } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

export interface PostgresHealthResult {
  status: 'ok' | 'error';
  database: 'neon_postgres' | 'in_memory_file';
  healthy: boolean;
  serverTime?: string;
  error?: string;
  counts?: {
    users: number;
    shipments: number;
    tickets: number;
    alerts: number;
  };
}

class NeonPostgres {
  private url: string | null = null;
  private sql: any = null;
  private initialized = false;

  constructor() {
    this.url = process.env.DATABASE_URL || null;
    if (this.url && !this.url.includes('your-db-host') && !this.url.includes('example.com') && !this.url.includes('placeholder')) {
      try {
        this.sql = neon(this.url);
      } catch (e) {
        console.warn('[NeonPostgres] Could not initialize Neon client:', e);
      }
    }
  }

  isConfigured(): boolean {
    if (!this.url || !this.sql) return false;
    if (this.url.includes('your-db-host') || this.url.includes('example.com') || this.url.includes('placeholder')) {
      return false;
    }
    return true;
  }

  async runHealthQuery(): Promise<PostgresHealthResult> {
    if (!this.isConfigured() || !this.sql) {
      return {
        status: 'ok',
        database: 'in_memory_file',
        healthy: true,
      };
    }

    try {
      const result = await this.sql`SELECT 1 as healthy, NOW() as server_time`;
      let userCount = 0;
      let shipmentCount = 0;
      let ticketCount = 0;
      let alertCount = 0;

      try {
        const uRes = await this.sql`SELECT COUNT(*)::int as count FROM users`;
        userCount = uRes[0]?.count || 0;
        const sRes = await this.sql`SELECT COUNT(*)::int as count FROM shipments`;
        shipmentCount = sRes[0]?.count || 0;
        const tRes = await this.sql`SELECT COUNT(*)::int as count FROM tickets`;
        ticketCount = tRes[0]?.count || 0;
        const aRes = await this.sql`SELECT COUNT(*)::int as count FROM alerts`;
        alertCount = aRes[0]?.count || 0;
      } catch {
        // Tables may not be populated yet
      }

      return {
        status: 'ok',
        database: 'neon_postgres',
        healthy: true,
        serverTime: result[0]?.server_time ? new Date(result[0].server_time).toISOString() : new Date().toISOString(),
        counts: {
          users: userCount,
          shipments: shipmentCount,
          tickets: ticketCount,
          alerts: alertCount,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        status: 'error',
        database: 'neon_postgres',
        healthy: false,
        error: msg,
      };
    }
  }

  async initSchema(): Promise<void> {
    if (!this.isConfigured() || !this.sql || this.initialized) return;

    try {
      await this.sql`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `;

      await this.sql`
        CREATE TABLE IF NOT EXISTS deleted_accounts (
          email TEXT PRIMARY KEY,
          user_id TEXT,
          deleted_at TIMESTAMPTZ DEFAULT NOW()
        );
      `;

      await this.sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          avatar_initial TEXT NOT NULL,
          backup_recipient TEXT DEFAULT '',
          delivery_instructions TEXT DEFAULT '',
          notifications JSONB DEFAULT '{"statusUpdates":true,"arrivalReminders":true}',
          role TEXT DEFAULT 'user',
          email_verified BOOLEAN DEFAULT TRUE,
          recovery_code_hash TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `;

      await this.sql`
        CREATE TABLE IF NOT EXISTS shipments (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          item TEXT NOT NULL,
          custom_label TEXT,
          store TEXT,
          tracking_number TEXT NOT NULL,
          courier TEXT NOT NULL,
          courier_name TEXT NOT NULL,
          status TEXT NOT NULL,
          eta TEXT,
          estimated_date TEXT,
          time_window TEXT,
          location TEXT,
          events JSONB DEFAULT '[]',
          image_url TEXT,
          is_archived BOOLEAN DEFAULT FALSE,
          is_demo BOOLEAN DEFAULT FALSE,
          notes TEXT,
          last_updated TEXT,
          last_refreshed_at TIMESTAMPTZ DEFAULT NOW(),
          courier_event_time TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `;

      await this.sql`
        CREATE TABLE IF NOT EXISTS tickets (
          id TEXT PRIMARY KEY,
          ticket_ref TEXT NOT NULL,
          user_id TEXT NOT NULL,
          user_email TEXT NOT NULL,
          userName TEXT NOT NULL DEFAULT '',
          contact_name TEXT,
          contact_email TEXT,
          contact_phone TEXT,
          contact_whatsapp TEXT,
          preferred_contact_method TEXT,
          shipment_id TEXT,
          shipment_label TEXT,
          tracking_number TEXT,
          courier TEXT,
          is_manual_tracking BOOLEAN DEFAULT FALSE,
          category TEXT NOT NULL,
          category_label TEXT,
          subject TEXT NOT NULL,
          description TEXT NOT NULL,
          status TEXT DEFAULT 'Open',
          staff_reply TEXT,
          attachment_name TEXT,
          attachment_data_url TEXT,
          attachment_size INT,
          attachment_type TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `;

      await this.sql`
        CREATE TABLE IF NOT EXISTS alerts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          shipment_id TEXT,
          shipment_item TEXT,
          tracking_number TEXT,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          read BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `;

      await this.sql`
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          last_verified_at BIGINT NOT NULL
        );
      `;

      await this.sql`
        CREATE TABLE IF NOT EXISTS email_integrations (
          user_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          email TEXT,
          connected_at TIMESTAMPTZ,
          message TEXT,
          access_token TEXT,
          refresh_token TEXT
        );
      `;

      this.initialized = true;
      console.log('[NeonPostgres] Schema initialized successfully.');
    } catch (e) {
      console.error('[NeonPostgres] Schema initialization error:', e);
    }
  }

  async migrateInitialSeed(seedData: any): Promise<void> {
    if (!this.isConfigured() || !this.sql) return;
    await this.initSchema();

    try {
      const migrated = await this.sql`SELECT value FROM meta WHERE key = 'seed_migrated'`;
      if (migrated.length > 0 && migrated[0].value === 'true') {
        // Already migrated once
        return;
      }

      // Check deleted accounts to prevent resurrecting deleted users
      const deletedRows = await this.sql`SELECT email, user_id FROM deleted_accounts`;
      const deletedEmails = new Set(deletedRows.map((r: any) => (r.email || '').toLowerCase()));
      const deletedIds = new Set(deletedRows.map((r: any) => r.user_id).filter(Boolean));

      // Also include deletedUserIds/deletedEmails from db.json if present
      (seedData.deletedEmails || []).forEach((e: string) => deletedEmails.add(e.toLowerCase()));
      (seedData.deletedUserIds || []).forEach((id: string) => deletedIds.add(id));

      for (const email of deletedEmails) {
        await this.sql`
          INSERT INTO deleted_accounts (email)
          VALUES (${email})
          ON CONFLICT (email) DO NOTHING
        `;
      }

      // Migrate users
      for (const user of seedData.users || []) {
        const normEmail = (user.email || '').toLowerCase();
        if (deletedEmails.has(normEmail) || deletedIds.has(user.id)) {
          continue; // Skip deleted user
        }

        await this.sql`
          INSERT INTO users (
            id, email, password_hash, name, avatar_initial,
            backup_recipient, delivery_instructions, notifications,
            role, email_verified, recovery_code_hash, created_at
          ) VALUES (
            ${user.id}, ${normEmail}, ${user.passwordHash}, ${user.name},
            ${user.avatarInitial || 'U'}, ${user.backupRecipient || ''},
            ${user.deliveryInstructions || ''},
            ${JSON.stringify(user.notifications || { statusUpdates: true, arrivalReminders: true })},
            ${user.role || 'user'}, ${user.emailVerified !== false},
            ${user.recoveryCodeHash || null}, ${user.createdAt || new Date().toISOString()}
          )
          ON CONFLICT (id) DO NOTHING
        `;
      }

      // Migrate shipments
      for (const ship of seedData.shipments || []) {
        if (deletedIds.has(ship.userId)) continue;
        await this.sql`
          INSERT INTO shipments (
            id, user_id, item, custom_label, store, tracking_number,
            courier, courier_name, status, eta, estimated_date,
            time_window, location, events, image_url, is_archived,
            is_demo, notes, last_updated, last_refreshed_at,
            courier_event_time, created_at
          ) VALUES (
            ${ship.id}, ${ship.userId}, ${ship.item}, ${ship.customLabel || null},
            ${ship.store || 'Online Store'}, ${ship.trackingNumber},
            ${ship.courier}, ${ship.courierName}, ${ship.status},
            ${ship.eta || 'In transit'}, ${ship.estimatedDate || null},
            ${ship.timeWindow || null}, ${ship.location || ''},
            ${JSON.stringify(ship.events || [])}, ${ship.imageUrl || null},
            ${!!ship.isArchived}, ${!!ship.isDemo}, ${ship.notes || null},
            ${ship.lastUpdated || null}, ${ship.lastRefreshedAt || new Date().toISOString()},
            ${ship.courierEventTime || null}, ${ship.createdAt || new Date().toISOString()}
          )
          ON CONFLICT (id) DO NOTHING
        `;
      }

      // Migrate alerts
      for (const alert of seedData.alerts || []) {
        if (deletedIds.has(alert.userId)) continue;
        await this.sql`
          INSERT INTO alerts (
            id, user_id, shipment_id, shipment_item, tracking_number,
            type, title, message, read, created_at
          ) VALUES (
            ${alert.id}, ${alert.userId}, ${alert.shipmentId || null},
            ${alert.shipmentItem || ''}, ${alert.trackingNumber || ''},
            ${alert.type}, ${alert.title}, ${alert.message},
            ${!!alert.read}, ${alert.createdAt || new Date().toISOString()}
          )
          ON CONFLICT (id) DO NOTHING
        `;
      }

      // Mark migration complete
      await this.sql`
        INSERT INTO meta (key, value)
        VALUES ('seed_migrated', 'true')
        ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW()
      `;

      console.log('[NeonPostgres] Initial seed migration completed.');
    } catch (e) {
      console.error('[NeonPostgres] Error during seed migration:', e);
    }
  }

  async loadAll(): Promise<{
    users: any[];
    shipments: any[];
    tickets: any[];
    alerts: any[];
    sessions: Record<string, any>;
    emailIntegrations: Record<string, any>;
    deletedEmails: string[];
    deletedUserIds: string[];
  } | null> {
    if (!this.isConfigured() || !this.sql) return null;
    await this.initSchema();

    try {
      const [uRows, sRows, tRows, aRows, sessRows, emRows, delRows] = await Promise.all([
        this.sql`SELECT * FROM users`,
        this.sql`SELECT * FROM shipments ORDER BY created_at DESC`,
        this.sql`SELECT * FROM tickets ORDER BY created_at DESC`,
        this.sql`SELECT * FROM alerts ORDER BY created_at DESC`,
        this.sql`SELECT * FROM sessions`,
        this.sql`SELECT * FROM email_integrations`,
        this.sql`SELECT * FROM deleted_accounts`,
      ]);

      const users = uRows.map((r: any) => ({
        id: r.id,
        email: r.email,
        passwordHash: r.password_hash,
        name: r.name,
        avatarInitial: r.avatar_initial,
        backupRecipient: r.backup_recipient || '',
        deliveryInstructions: r.delivery_instructions || '',
        notifications: typeof r.notifications === 'string' ? JSON.parse(r.notifications) : r.notifications,
        role: r.role || 'user',
        emailVerified: r.email_verified,
        recoveryCodeHash: r.recovery_code_hash || undefined,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      }));

      const shipments = sRows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        item: r.item,
        customLabel: r.custom_label || undefined,
        store: r.store || 'Online Store',
        trackingNumber: r.tracking_number,
        courier: r.courier,
        courierName: r.courier_name,
        status: r.status,
        eta: r.eta,
        estimatedDate: r.estimated_date || undefined,
        timeWindow: r.time_window || undefined,
        location: r.location || '',
        events: typeof r.events === 'string' ? JSON.parse(r.events) : (r.events || []),
        imageUrl: r.image_url || undefined,
        isArchived: !!r.is_archived,
        isDemo: !!r.is_demo,
        notes: r.notes || undefined,
        lastUpdated: r.last_updated || undefined,
        lastRefreshedAt: r.last_refreshed_at ? new Date(r.last_refreshed_at).toISOString() : new Date().toISOString(),
        courierEventTime: r.courier_event_time || undefined,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      }));

      const tickets = tRows.map((r: any) => ({
        id: r.id,
        ticketRef: r.ticket_ref,
        userId: r.user_id,
        userEmail: r.user_email,
        userName: r.username || '',
        contactName: r.contact_name || undefined,
        contactEmail: r.contact_email || undefined,
        contactPhone: r.contact_phone || undefined,
        contactWhatsapp: r.contact_whatsapp || undefined,
        preferredContactMethod: r.preferred_contact_method || 'email',
        shipmentId: r.shipment_id || undefined,
        shipmentLabel: r.shipment_label || undefined,
        trackingNumber: r.tracking_number || undefined,
        courier: r.courier || undefined,
        isManualTracking: !!r.is_manual_tracking,
        category: r.category,
        categoryLabel: r.category_label || undefined,
        subject: r.subject,
        description: r.description,
        status: r.status || 'Open',
        staffReply: r.staff_reply || undefined,
        attachmentName: r.attachment_name || undefined,
        attachmentDataUrl: r.attachment_data_url || undefined,
        attachmentSize: r.attachment_size || undefined,
        attachmentType: r.attachment_type || undefined,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      }));

      const alerts = aRows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        shipmentId: r.shipment_id || '',
        shipmentItem: r.shipment_item || '',
        trackingNumber: r.tracking_number || '',
        type: r.type,
        title: r.title,
        message: r.message,
        read: !!r.read,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      }));

      const sessions: Record<string, any> = {};
      for (const s of sessRows) {
        sessions[s.token] = {
          userId: s.user_id,
          createdAt: Number(s.created_at),
          lastVerifiedAt: Number(s.last_verified_at),
        };
      }

      const emailIntegrations: Record<string, any> = {};
      for (const em of emRows) {
        emailIntegrations[em.user_id] = {
          status: em.status,
          email: em.email || undefined,
          connectedAt: em.connected_at ? new Date(em.connected_at).toISOString() : undefined,
          message: em.message || undefined,
          accessToken: em.access_token || undefined,
          refreshToken: em.refresh_token || undefined,
        };
      }

      const deletedEmails = delRows.map((d: any) => (d.email || '').toLowerCase());
      const deletedUserIds = delRows.map((d: any) => d.user_id).filter(Boolean);

      return {
        users,
        shipments,
        tickets,
        alerts,
        sessions,
        emailIntegrations,
        deletedEmails,
        deletedUserIds,
      };
    } catch (e) {
      console.error('[NeonPostgres] Error loading database:', e);
      return null;
    }
  }

  // --- Persistence Handlers ---

  async saveUser(user: any): Promise<void> {
    if (!this.isConfigured() || !this.sql) return;
    try {
      const normEmail = (user.email || '').toLowerCase();
      // Remove from deleted_accounts if this is a fresh registration
      await this.sql`DELETE FROM deleted_accounts WHERE email = ${normEmail}`;

      await this.sql`
        INSERT INTO users (
          id, email, password_hash, name, avatar_initial,
          backup_recipient, delivery_instructions, notifications,
          role, email_verified, recovery_code_hash, created_at
        ) VALUES (
          ${user.id}, ${normEmail}, ${user.passwordHash}, ${user.name},
          ${user.avatarInitial || 'U'}, ${user.backupRecipient || ''},
          ${user.deliveryInstructions || ''},
          ${JSON.stringify(user.notifications || {})},
          ${user.role || 'user'}, ${user.emailVerified !== false},
          ${user.recoveryCodeHash || null}, ${user.createdAt || new Date().toISOString()}
        )
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          name = EXCLUDED.name,
          avatar_initial = EXCLUDED.avatar_initial,
          backup_recipient = EXCLUDED.backup_recipient,
          delivery_instructions = EXCLUDED.delivery_instructions,
          notifications = EXCLUDED.notifications,
          role = EXCLUDED.role,
          email_verified = EXCLUDED.email_verified,
          recovery_code_hash = EXCLUDED.recovery_code_hash
      `;
    } catch (e) {
      console.error('[NeonPostgres] saveUser error:', e);
    }
  }

  async saveShipment(shipment: any): Promise<void> {
    if (!this.isConfigured() || !this.sql) return;
    try {
      await this.sql`
        INSERT INTO shipments (
          id, user_id, item, custom_label, store, tracking_number,
          courier, courier_name, status, eta, estimated_date,
          time_window, location, events, image_url, is_archived,
          is_demo, notes, last_updated, last_refreshed_at,
          courier_event_time, created_at
        ) VALUES (
          ${shipment.id}, ${shipment.userId}, ${shipment.item}, ${shipment.customLabel || null},
          ${shipment.store || 'Online Store'}, ${shipment.trackingNumber},
          ${shipment.courier}, ${shipment.courierName}, ${shipment.status},
          ${shipment.eta || 'In transit'}, ${shipment.estimatedDate || null},
          ${shipment.timeWindow || null}, ${shipment.location || ''},
          ${JSON.stringify(shipment.events || [])}, ${shipment.imageUrl || null},
          ${!!shipment.isArchived}, ${!!shipment.isDemo}, ${shipment.notes || null},
          ${shipment.lastUpdated || null}, ${shipment.lastRefreshedAt || new Date().toISOString()},
          ${shipment.courierEventTime || null}, ${shipment.createdAt || new Date().toISOString()}
        )
        ON CONFLICT (id) DO UPDATE SET
          item = EXCLUDED.item,
          custom_label = EXCLUDED.custom_label,
          store = EXCLUDED.store,
          tracking_number = EXCLUDED.tracking_number,
          courier = EXCLUDED.courier,
          courier_name = EXCLUDED.courier_name,
          status = EXCLUDED.status,
          eta = EXCLUDED.eta,
          estimated_date = EXCLUDED.estimated_date,
          time_window = EXCLUDED.time_window,
          location = EXCLUDED.location,
          events = EXCLUDED.events,
          image_url = EXCLUDED.image_url,
          is_archived = EXCLUDED.is_archived,
          notes = EXCLUDED.notes,
          last_updated = EXCLUDED.last_updated,
          last_refreshed_at = EXCLUDED.last_refreshed_at,
          courier_event_time = EXCLUDED.courier_event_time
      `;
    } catch (e) {
      console.error('[NeonPostgres] saveShipment error:', e);
    }
  }

  async deleteShipment(id: string, userId: string): Promise<void> {
    if (!this.isConfigured() || !this.sql) return;
    try {
      await this.sql`DELETE FROM shipments WHERE id = ${id} AND user_id = ${userId}`;
    } catch (e) {
      console.error('[NeonPostgres] deleteShipment error:', e);
    }
  }

  async saveTicket(ticket: any): Promise<void> {
    if (!this.isConfigured() || !this.sql) return;
    try {
      await this.sql`
        INSERT INTO tickets (
          id, ticket_ref, user_id, user_email, username, contact_name,
          contact_email, contact_phone, contact_whatsapp, preferred_contact_method,
          shipment_id, shipment_label, tracking_number, courier,
          is_manual_tracking, category, category_label, subject,
          description, status, staff_reply, attachment_name,
          attachment_data_url, attachment_size, attachment_type, created_at
        ) VALUES (
          ${ticket.id}, ${ticket.ticketRef}, ${ticket.userId}, ${ticket.userEmail},
          ${ticket.userName || ''}, ${ticket.contactName || null},
          ${ticket.contactEmail || null}, ${ticket.contactPhone || null},
          ${ticket.contactWhatsapp || null}, ${ticket.preferredContactMethod || 'email'},
          ${ticket.shipmentId || null}, ${ticket.shipmentLabel || null},
          ${ticket.trackingNumber || null}, ${ticket.courier || null},
          ${!!ticket.isManualTracking}, ${ticket.category}, ${ticket.categoryLabel || null},
          ${ticket.subject}, ${ticket.description}, ${ticket.status || 'Open'},
          ${ticket.staffReply || null}, ${ticket.attachmentName || null},
          ${ticket.attachmentDataUrl || null}, ${ticket.attachmentSize || null},
          ${ticket.attachmentType || null}, ${ticket.createdAt || new Date().toISOString()}
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          staff_reply = EXCLUDED.staff_reply
      `;
    } catch (e) {
      console.error('[NeonPostgres] saveTicket error:', e);
    }
  }

  async saveAlert(alert: any): Promise<void> {
    if (!this.isConfigured() || !this.sql) return;
    try {
      await this.sql`
        INSERT INTO alerts (
          id, user_id, shipment_id, shipment_item, tracking_number,
          type, title, message, read, created_at
        ) VALUES (
          ${alert.id}, ${alert.userId}, ${alert.shipmentId || null},
          ${alert.shipmentItem || ''}, ${alert.trackingNumber || ''},
          ${alert.type}, ${alert.title}, ${alert.message},
          ${!!alert.read}, ${alert.createdAt || new Date().toISOString()}
        )
        ON CONFLICT (id) DO UPDATE SET
          read = EXCLUDED.read
      `;
    } catch (e) {
      console.error('[NeonPostgres] saveAlert error:', e);
    }
  }

  async saveSession(token: string, sessionData: any): Promise<void> {
    if (!this.isConfigured() || !this.sql) return;
    try {
      const uid = typeof sessionData === 'string' ? sessionData : sessionData.userId;
      const createdAt = typeof sessionData === 'object' ? sessionData.createdAt : Date.now();
      const lastVerified = typeof sessionData === 'object' ? sessionData.lastVerifiedAt : Date.now();

      await this.sql`
        INSERT INTO sessions (token, user_id, created_at, last_verified_at)
        VALUES (${token}, ${uid}, ${createdAt}, ${lastVerified})
        ON CONFLICT (token) DO UPDATE SET
          last_verified_at = EXCLUDED.last_verified_at
      `;
    } catch (e) {
      console.error('[NeonPostgres] saveSession error:', e);
    }
  }

  async deleteSession(token: string): Promise<void> {
    if (!this.isConfigured() || !this.sql) return;
    try {
      await this.sql`DELETE FROM sessions WHERE token = ${token}`;
    } catch (e) {
      console.error('[NeonPostgres] deleteSession error:', e);
    }
  }

  async saveEmailIntegration(userId: string, state: any): Promise<void> {
    if (!this.isConfigured() || !this.sql) return;
    try {
      await this.sql`
        INSERT INTO email_integrations (
          user_id, status, email, connected_at, message, access_token, refresh_token
        ) VALUES (
          ${userId}, ${state.status}, ${state.email || null},
          ${state.connectedAt ? new Date(state.connectedAt) : null},
          ${state.message || null}, ${state.accessToken || null}, ${state.refreshToken || null}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          status = EXCLUDED.status,
          email = EXCLUDED.email,
          connected_at = EXCLUDED.connected_at,
          message = EXCLUDED.message,
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token
      `;
    } catch (e) {
      console.error('[NeonPostgres] saveEmailIntegration error:', e);
    }
  }

  mapUserRow(r: any) {
    if (!r) return null;
    return {
      id: r.id,
      email: r.email,
      passwordHash: r.password_hash,
      name: r.name,
      avatarInitial: r.avatar_initial,
      backupRecipient: r.backup_recipient || '',
      deliveryInstructions: r.delivery_instructions || '',
      notifications: typeof r.notifications === 'string' ? JSON.parse(r.notifications) : (r.notifications || { statusUpdates: true, arrivalReminders: true }),
      role: r.role || 'user',
      emailVerified: r.email_verified !== false,
      recoveryCodeHash: r.recovery_code_hash || undefined,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    };
  }

  mapShipmentRow(r: any) {
    if (!r) return null;
    return {
      id: r.id,
      userId: r.user_id,
      item: r.item,
      customLabel: r.custom_label || undefined,
      store: r.store || 'Online Store',
      trackingNumber: r.tracking_number,
      courier: r.courier,
      courierName: r.courier_name,
      status: r.status,
      eta: r.eta,
      estimatedDate: r.estimated_date || undefined,
      timeWindow: r.time_window || undefined,
      location: r.location || '',
      events: typeof r.events === 'string' ? JSON.parse(r.events) : (r.events || []),
      imageUrl: r.image_url || undefined,
      isArchived: !!r.is_archived,
      isDemo: !!r.is_demo,
      notes: r.notes || undefined,
      lastUpdated: r.last_updated || undefined,
      lastRefreshedAt: r.last_refreshed_at ? new Date(r.last_refreshed_at).toISOString() : new Date().toISOString(),
      courierEventTime: r.courier_event_time || undefined,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    };
  }

  mapTicketRow(r: any) {
    if (!r) return null;
    return {
      id: r.id,
      ticketRef: r.ticket_ref,
      userId: r.user_id,
      userEmail: r.user_email,
      userName: r.username || '',
      contactName: r.contact_name || undefined,
      contactEmail: r.contact_email || undefined,
      contactPhone: r.contact_phone || undefined,
      contactWhatsapp: r.contact_whatsapp || undefined,
      preferredContactMethod: r.preferred_contact_method || 'email',
      shipmentId: r.shipment_id || undefined,
      shipmentLabel: r.shipment_label || undefined,
      trackingNumber: r.tracking_number || undefined,
      courier: r.courier || undefined,
      isManualTracking: !!r.is_manual_tracking,
      category: r.category,
      categoryLabel: r.category_label || undefined,
      subject: r.subject,
      description: r.description,
      status: r.status || 'Open',
      staffReply: r.staff_reply || undefined,
      attachmentName: r.attachment_name || undefined,
      attachmentDataUrl: r.attachment_data_url || undefined,
      attachmentSize: r.attachment_size || undefined,
      attachmentType: r.attachment_type || undefined,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    };
  }

  mapAlertRow(r: any) {
    if (!r) return null;
    return {
      id: r.id,
      userId: r.user_id,
      shipmentId: r.shipment_id || '',
      shipmentItem: r.shipment_item || '',
      trackingNumber: r.tracking_number || '',
      type: r.type,
      title: r.title,
      message: r.message,
      read: !!r.read,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    };
  }

  async getUserBySession(token: string): Promise<any | null> {
    if (!this.isConfigured() || !this.sql) return null;
    await this.initSchema();
    const rows = (await this.sql`
      SELECT u.* FROM users u
      JOIN sessions s ON u.id = s.user_id
      WHERE s.token = ${token}
      LIMIT 1
    `) as any[];
    return rows[0] ? this.mapUserRow(rows[0]) : null;
  }

  async getUserByEmail(email: string): Promise<any | null> {
    if (!this.isConfigured() || !this.sql) return null;
    await this.initSchema();
    const norm = (email || '').trim().toLowerCase();
    const rows = (await this.sql`
      SELECT * FROM users WHERE LOWER(email) = ${norm} LIMIT 1
    `) as any[];
    return rows[0] ? this.mapUserRow(rows[0]) : null;
  }

  async getUserById(id: string): Promise<any | null> {
    if (!this.isConfigured() || !this.sql) return null;
    await this.initSchema();
    const rows = (await this.sql`
      SELECT * FROM users WHERE id = ${id} LIMIT 1
    `) as any[];
    return rows[0] ? this.mapUserRow(rows[0]) : null;
  }

  async getShipmentsForUser(userId: string, filter?: string, search?: string): Promise<any[]> {
    if (!this.isConfigured() || !this.sql) return [];
    await this.initSchema();
    const rows = (await this.sql`
      SELECT * FROM shipments WHERE user_id = ${userId} ORDER BY created_at DESC
    `) as any[];
    let items = rows.map((r: any) => this.mapShipmentRow(r));
    if (filter === 'active') {
      items = items.filter((s: any) => !s.isArchived && s.status !== 'Delivered');
    } else if (filter === 'delivered') {
      items = items.filter((s: any) => s.status === 'Delivered');
    } else if (filter === 'attention') {
      items = items.filter((s: any) => !s.isArchived && (s.status === 'Delivery attempted' || s.status === 'Delayed'));
    }
    if (search) {
      const q = search.trim().toLowerCase();
      items = items.filter((s: any) =>
        (s.item || '').toLowerCase().includes(q) ||
        (s.trackingNumber || '').toLowerCase().includes(q) ||
        (s.courierName || '').toLowerCase().includes(q) ||
        (s.store || '').toLowerCase().includes(q)
      );
    }
    return items;
  }

  async getShipmentById(id: string, userId: string): Promise<any | null> {
    if (!this.isConfigured() || !this.sql) return null;
    await this.initSchema();
    const rows = (await this.sql`
      SELECT * FROM shipments WHERE id = ${id} AND user_id = ${userId} LIMIT 1
    `) as any[];
    return rows[0] ? this.mapShipmentRow(rows[0]) : null;
  }

  async findDuplicateShipment(userId: string, courier: string, trackingNumber: string): Promise<any | null> {
    if (!this.isConfigured() || !this.sql) return null;
    await this.initSchema();
    const cleanNum = trackingNumber.trim().toUpperCase();
    const cleanCourier = courier.trim().toLowerCase();
    const rows = (await this.sql`
      SELECT * FROM shipments
      WHERE user_id = ${userId}
        AND LOWER(courier) = ${cleanCourier}
        AND UPPER(tracking_number) = ${cleanNum}
        AND is_archived = FALSE
      LIMIT 1
    `) as any[];
    return rows[0] ? this.mapShipmentRow(rows[0]) : null;
  }

  async getAlertsForUser(userId: string): Promise<any[]> {
    if (!this.isConfigured() || !this.sql) return [];
    await this.initSchema();
    const rows = (await this.sql`
      SELECT * FROM alerts WHERE user_id = ${userId} ORDER BY created_at DESC
    `) as any[];
    return rows.map((r: any) => this.mapAlertRow(r));
  }

  async markAlertRead(id: string, userId: string): Promise<boolean> {
    if (!this.isConfigured() || !this.sql) return false;
    await this.initSchema();
    await this.sql`
      UPDATE alerts SET read = TRUE WHERE id = ${id} AND user_id = ${userId}
    `;
    return true;
  }

  async markAllAlertsRead(userId: string): Promise<void> {
    if (!this.isConfigured() || !this.sql) return;
    await this.initSchema();
    await this.sql`
      UPDATE alerts SET read = TRUE WHERE user_id = ${userId}
    `;
  }

  async clearAlerts(userId: string): Promise<void> {
    if (!this.isConfigured() || !this.sql) return;
    await this.initSchema();
    await this.sql`
      DELETE FROM alerts WHERE user_id = ${userId}
    `;
  }

  async getTicketsForUser(userId: string): Promise<any[]> {
    if (!this.isConfigured() || !this.sql) return [];
    await this.initSchema();
    const rows = (await this.sql`
      SELECT * FROM tickets WHERE user_id = ${userId} ORDER BY created_at DESC
    `) as any[];
    return rows.map((r: any) => this.mapTicketRow(r));
  }

  async getAllTickets(): Promise<any[]> {
    if (!this.isConfigured() || !this.sql) return [];
    await this.initSchema();
    const rows = (await this.sql`
      SELECT * FROM tickets ORDER BY created_at DESC
    `) as any[];
    return rows.map((r: any) => this.mapTicketRow(r));
  }

  async updateTicketStatus(id: string, status: string, staffReply?: string): Promise<any | null> {
    if (!this.isConfigured() || !this.sql) return null;
    await this.initSchema();
    const rows = (await this.sql`
      UPDATE tickets
      SET status = ${status}, staff_reply = COALESCE(${staffReply || null}, staff_reply)
      WHERE id = ${id}
      RETURNING *
    `) as any[];
    return rows[0] ? this.mapTicketRow(rows[0]) : null;
  }

  async getEmailIntegration(userId: string): Promise<any> {
    if (!this.isConfigured() || !this.sql) {
      return { status: 'disconnected', message: 'Gmail order scanning is not connected.' };
    }
    await this.initSchema();
    const rows = (await this.sql`
      SELECT * FROM email_integrations WHERE user_id = ${userId} LIMIT 1
    `) as any[];
    if (rows[0]) {
      return {
        status: rows[0].status,
        email: rows[0].email || undefined,
        connectedAt: rows[0].connected_at ? new Date(rows[0].connected_at).toISOString() : undefined,
        message: rows[0].message || undefined,
        accessToken: rows[0].access_token || undefined,
        refreshToken: rows[0].refresh_token || undefined,
      };
    }
    return { status: 'disconnected', message: 'Gmail order scanning is not connected.' };
  }

  async updateUserProfile(userId: string, updates: any): Promise<any | null> {
    if (!this.isConfigured() || !this.sql) return null;
    await this.initSchema();
    const current = await this.getUserById(userId);
    if (!current) return null;

    const newName = updates.name !== undefined ? updates.name.trim() : current.name;
    const newInitial = (newName[0] || 'U').toUpperCase();
    const newBackup = updates.backupRecipient !== undefined ? updates.backupRecipient : current.backupRecipient;
    const newDelivery = updates.deliveryInstructions !== undefined ? updates.deliveryInstructions : current.deliveryInstructions;
    const newNotifs = updates.notifications ? { ...current.notifications, ...updates.notifications } : current.notifications;

    const rows = (await this.sql`
      UPDATE users
      SET name = ${newName}, avatar_initial = ${newInitial}, backup_recipient = ${newBackup},
          delivery_instructions = ${newDelivery}, notifications = ${JSON.stringify(newNotifs)}
      WHERE id = ${userId}
      RETURNING *
    `) as any[];
    return rows[0] ? this.mapUserRow(rows[0]) : null;
  }

  async updateUserPassword(userId: string, newPasswordHash: string, keepSessionToken?: string): Promise<void> {
    if (!this.isConfigured() || !this.sql) throw new Error('Database not configured');
    await this.initSchema();
    await this.sql`
      UPDATE users SET password_hash = ${newPasswordHash} WHERE id = ${userId}
    `;
    if (keepSessionToken) {
      await this.sql`
        DELETE FROM sessions WHERE user_id = ${userId} AND token != ${keepSessionToken}
      `;
    } else {
      await this.sql`
        DELETE FROM sessions WHERE user_id = ${userId}
      `;
    }
  }

  async deleteAccount(userId: string, email: string): Promise<void> {
    if (!this.isConfigured() || !this.sql) throw new Error('Database not configured');
    try {
      const normEmail = (email || '').toLowerCase();
      // Record tombstone so later imports never restore this user
      await this.sql`
        INSERT INTO deleted_accounts (email, user_id, deleted_at)
        VALUES (${normEmail}, ${userId}, NOW())
        ON CONFLICT (email) DO UPDATE SET user_id = ${userId}, deleted_at = NOW()
      `;

      // Delete all records and private attachments belonging to this user
      await this.sql`DELETE FROM sessions WHERE user_id = ${userId}`;
      await this.sql`DELETE FROM alerts WHERE user_id = ${userId}`;
      await this.sql`DELETE FROM shipments WHERE user_id = ${userId}`;
      await this.sql`DELETE FROM tickets WHERE user_id = ${userId}`;
      await this.sql`DELETE FROM email_integrations WHERE user_id = ${userId}`;
      await this.sql`DELETE FROM users WHERE id = ${userId}`;

      console.log(`[NeonPostgres] Successfully purged all records for user ${userId} (${email}).`);
    } catch (e) {
      console.error('[NeonPostgres] deleteAccount error:', e);
      throw e;
    }
  }

  async deleteAccountSessions(userId: string): Promise<void> {
    if (!this.isConfigured() || !this.sql) return;
    await this.initSchema();
    await this.sql`DELETE FROM sessions WHERE user_id = ${userId}`;
  }
}

export const neonPostgres = new NeonPostgres();
