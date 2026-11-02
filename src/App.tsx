/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Shipment, UserProfile, SupportTicket, InAppAlert, PageViewId } from './types';
import {
  calculateSummaryStats,
  formatRelativeTime,
  getShipmentProgress,
  groupShipmentsByDate,
  groupDeliveredByMonth,
} from './utils/courier';
import { AddDeliveryModal } from './components/AddDeliveryModal';
import { OrderDetailsModal } from './components/OrderDetailsModal';
import { ReportIssueModal } from './components/ReportIssueModal';
import { EmailConnectModal } from './components/EmailConnectModal';
import { AuthModal } from './components/AuthModal';
import { usePWAInstall } from './hooks/usePWAInstall';

const getLocalDateStr = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function App() {
  // Theme state: dark mode preserved, light mode with beige surfaces and black text
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('parcelpath-theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [activePage, setActivePage] = useState<PageViewId>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);

  // Deliveries Sub-View: 'list' | 'calendar' | 'history' | 'today'
  const [deliveriesSubView, setDeliveriesSubView] = useState<'list' | 'calendar' | 'history' | 'today'>('list');

  // Selected date for calendar view (YYYY-MM-DD)
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() => {
    return getLocalDateStr();
  });

  // Auth & Session
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('parcelpath-session-token') || 'demo_session_token_kusuma';
    } catch {
      return 'demo_session_token_kusuma';
    }
  });
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Shipments state
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loadingShipments, setLoadingShipments] = useState(true);
  const [selectedStatFilter, setSelectedStatFilter] = useState<'all' | 'active' | 'today' | 'attention'>('all');
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [activeDetailShipment, setActiveDetailShipment] = useState<Shipment | null>(null);

  // Just-added shipment ID for highlight animation
  const [justAddedShipmentId, setJustAddedShipmentId] = useState<string | null>(null);

  // Notifications state
  const [alerts, setAlerts] = useState<InAppAlert[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [browserNotificationStatus, setBrowserNotificationStatus] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [preselectedIssueShipment, setPreselectedIssueShipment] = useState<Shipment | null>(null);
  const [isEmailConnectOpen, setIsEmailConnectOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Tickets state
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  // Search & Filter state in All Deliveries / History
  const [searchQuery, setSearchQuery] = useState('');
  const [deliveryFilter, setDeliveryFilter] = useState('all');
  const [historyCourierFilter, setHistoryCourierFilter] = useState('all');

  // Customer care config
  const [supportConfig, setSupportConfig] = useState({
    configured: false,
    supportEmail: 'Add your support email in environment or settings',
    supportPhone: 'Add your support number in environment or settings',
    hours: 'Mon-Sat: 9:00 AM – 7:00 PM IST',
  });

  // Settings form fields
  const [profileName, setProfileName] = useState('Kusuma');
  const [profileEmail, setProfileEmail] = useState('');
  const [backupRecipient, setBackupRecipient] = useState('Ravi · Security desk');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [statusNotification, setStatusNotification] = useState(true);
  const [arrivalNotification, setArrivalNotification] = useState(true);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

  // PWA Install hook
  const { isInstallable, isInstalled, install } = usePWAInstall();

  // Apply theme to DOM and save to localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const refContainer = document.getElementById('delivery-reference-style');
    if (refContainer) {
      refContainer.setAttribute('data-theme', theme);
    }
    try {
      localStorage.setItem('parcelpath-theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Keyboard listener for Escape to close menu and dialogs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showNotifications) setShowNotifications(false);
        if (menuOpen) setMenuOpen(false);
        if (isDetailsOpen) setIsDetailsOpen(false);
        if (isAddOpen) setIsAddOpen(false);
        if (isReportOpen) setIsReportOpen(false);
        if (isEmailConnectOpen) setIsEmailConnectOpen(false);
        if (isAuthOpen) setIsAuthOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen, isDetailsOpen, isAddOpen, isReportOpen, isEmailConnectOpen, isAuthOpen, showNotifications]);

  // Fetch current user profile
  const fetchUserProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        setProfileName(data.user.name);
        setProfileEmail(data.user.email);
        setBackupRecipient(data.user.backupRecipient || '');
        setDeliveryInstructions(data.user.deliveryInstructions || '');
        if (data.user.notifications) {
          setStatusNotification(data.user.notifications.statusUpdates ?? true);
          setArrivalNotification(data.user.notifications.arrivalReminders ?? true);
        }
      }
    } catch (e) {
      console.error('Failed to load profile:', e);
    }
  }, [sessionToken]);

  // Fetch shipments
  const fetchShipments = useCallback(async () => {
    setLoadingShipments(true);
    try {
      const res = await fetch('/api/shipments', {
        headers: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setShipments(data.shipments || []);
      }
    } catch (e) {
      console.error('Failed to load shipments:', e);
    } finally {
      setLoadingShipments(false);
    }
  }, [sessionToken]);

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', {
        headers: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch (e) {
      console.error('Failed to load alerts:', e);
    }
  }, [sessionToken]);

  // Fetch tickets
  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets', {
        headers: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (e) {
      console.error('Failed to load tickets:', e);
    }
  }, [sessionToken]);

  // Fetch support config
  const fetchSupportConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config/support');
      if (res.ok) {
        const data = await res.json();
        setSupportConfig(data);
      }
    } catch (e) {
      console.error('Failed to load support config:', e);
    }
  }, []);

  useEffect(() => {
    fetchUserProfile();
    fetchShipments();
    fetchAlerts();
    fetchTickets();
    fetchSupportConfig();
  }, [fetchUserProfile, fetchShipments, fetchAlerts, fetchTickets, fetchSupportConfig]);

  // Stats computation
  const stats = useMemo(() => {
    return calculateSummaryStats(shipments);
  }, [shipments]);

  // Active shipments (excludes delivered)
  const activeShipments = useMemo(() => {
    return shipments.filter((s) => s.status !== 'Delivered');
  }, [shipments]);

  // Delivered shipments (for History)
  const deliveredShipments = useMemo(() => {
    return shipments.filter((s) => s.status === 'Delivered');
  }, [shipments]);

  // Shipments arriving today
  const todayShipments = useMemo(() => {
    const todayStr = getLocalDateStr();
    return shipments.filter(
      (s) =>
        s.status !== 'Delivered' &&
        (s.estimatedDate === todayStr ||
          s.status === 'Out for delivery' ||
          (s.eta && s.eta.toLowerCase().includes('today')))
    );
  }, [shipments]);

  // Filtered shipments for Dashboard
  const dashboardShipments = useMemo(() => {
    if (selectedStatFilter === 'active') {
      return activeShipments;
    }
    if (selectedStatFilter === 'today') {
      return todayShipments;
    }
    if (selectedStatFilter === 'attention') {
      return shipments.filter(
        (s) => s.status === 'Delivery attempted' || s.status === 'Delayed' || s.status === 'Exception'
      );
    }
    return activeShipments;
  }, [activeShipments, todayShipments, shipments, selectedStatFilter]);

  // Filtered shipments for All Deliveries list
  const allDeliveriesFiltered = useMemo(() => {
    let list = activeShipments;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.item.toLowerCase().includes(q) ||
          (s.customLabel && s.customLabel.toLowerCase().includes(q)) ||
          s.store.toLowerCase().includes(q) ||
          s.trackingNumber.toLowerCase().includes(q) ||
          s.courierName.toLowerCase().includes(q)
      );
    }
    if (deliveryFilter === 'attention') {
      list = list.filter(
        (s) => s.status === 'Delivery attempted' || s.status === 'Delayed' || s.status === 'Exception'
      );
    } else if (deliveryFilter === 'out_for_delivery') {
      list = list.filter((s) => s.status === 'Out for delivery');
    } else if (deliveryFilter === 'in_transit') {
      list = list.filter((s) => s.status === 'In transit');
    }
    return list;
  }, [activeShipments, searchQuery, deliveryFilter]);

  // Calendar groupings
  const calendarGroupings = useMemo(() => {
    return groupShipmentsByDate(activeShipments);
  }, [activeShipments]);

  // History grouped by month
  const historyByMonth = useMemo(() => {
    let list = deliveredShipments;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.item.toLowerCase().includes(q) ||
          (s.customLabel && s.customLabel.toLowerCase().includes(q)) ||
          s.store.toLowerCase().includes(q) ||
          s.trackingNumber.toLowerCase().includes(q) ||
          s.courierName.toLowerCase().includes(q)
      );
    }
    if (historyCourierFilter !== 'all') {
      list = list.filter((s) => s.courier === historyCourierFilter);
    }
    return groupDeliveredByMonth(list);
  }, [deliveredShipments, searchQuery, historyCourierFilter]);

  // Detail modal opener
  const handleOpenDetails = (shipment: Shipment, e?: React.MouseEvent<HTMLButtonElement>) => {
    if (e) {
      const target = e.currentTarget;
      target.classList.remove('is-activated');
      void target.offsetWidth;
      target.classList.add('is-activated');
      setTimeout(() => target.classList.remove('is-activated'), 700);
    }
    setActiveDetailShipment(shipment);
    setTimeout(() => {
      setIsDetailsOpen(true);
    }, 180);
  };

  // Delete shipment
  const handleDeleteShipment = async (shipmentId: string) => {
    try {
      const res = await fetch(`/api/shipments/${shipmentId}`, {
        method: 'DELETE',
        headers: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
      });
      if (res.ok) {
        setShipments((prev) => prev.filter((s) => s.id !== shipmentId));
      }
    } catch (e) {
      console.error('Failed to remove shipment:', e);
    }
  };

  // Refresh shipment
  const handleRefreshShipment = async (shipmentId: string) => {
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/refresh`, {
        method: 'POST',
        headers: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setShipments((prev) => prev.map((s) => (s.id === shipmentId ? data.shipment : s)));
        setActiveDetailShipment(data.shipment);
      }
    } catch (e) {
      console.error('Failed to refresh shipment:', e);
    }
  };

  // Update custom label
  const handleUpdateLabel = async (shipmentId: string, newLabel: string) => {
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/label`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
        body: JSON.stringify({ label: newLabel }),
      });
      if (res.ok) {
        const data = await res.json();
        setShipments((prev) => prev.map((s) => (s.id === shipmentId ? data.shipment : s)));
        if (activeDetailShipment?.id === shipmentId) {
          setActiveDetailShipment(data.shipment);
        }
        setSettingsNotice('Custom label updated.');
        setTimeout(() => setSettingsNotice(null), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Notifications: Mark as read
  const handleMarkAlertRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        headers: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
      });
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkAllAlertsRead = async () => {
    try {
      await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
      });
      setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    } catch (e) {
      console.error(e);
    }
  };

  // Request browser notification permission
  const handleRequestBrowserNotifications = async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notifications. In-app alerts remain active.');
      return;
    }
    const perm = await Notification.requestPermission();
    setBrowserNotificationStatus(perm);
    if (perm === 'granted') {
      new Notification('ParcelPath Alerts Active', {
        body: 'You will receive delivery updates when courier scans occur.',
        icon: '/icon.svg',
      });
    }
  };

  // Save Preferences
  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
        body: JSON.stringify({
          backupRecipient,
          deliveryInstructions,
        }),
      });
      if (res.ok) {
        setSettingsNotice('Preferences saved successfully to your account.');
        setTimeout(() => setSettingsNotice(null), 3500);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Save Account Settings
  const handleSaveAccountSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
        body: JSON.stringify({
          name: profileName,
          notifications: {
            statusUpdates: statusNotification,
            arrivalReminders: arrivalNotification,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        setSettingsNotice('Account changes saved.');
        setTimeout(() => setSettingsNotice(null), 3500);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Delete Account
  const handleDeleteAccount = async () => {
    if (
      !window.confirm(
        'Are you sure you want to delete your account? All saved deliveries and tickets will be permanently deleted.'
      )
    ) {
      return;
    }
    try {
      await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
      });
      localStorage.removeItem('parcelpath-session-token');
      setSessionToken(null);
      setCurrentUser(null);
      setShipments([]);
      setTickets([]);
      setSettingsNotice('Account and all associated records deleted.');
      setActivePage('dashboard');
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('parcelpath-session-token');
    setSessionToken(null);
    setCurrentUser(null);
    setIsAuthOpen(false);
    fetchUserProfile();
    fetchShipments();
  };

  const handleLoginSuccess = (user: UserProfile, token: string) => {
    setCurrentUser(user);
    setSessionToken(token);
    try {
      localStorage.setItem('parcelpath-session-token', token);
    } catch {}
    fetchShipments();
    fetchTickets();
    fetchAlerts();
  };

  const navigateTo = (page: PageViewId) => {
    setActivePage(page);
    setMenuOpen(false);
  };

  const unreadAlertsCount = useMemo(() => {
    return alerts.filter((a) => !a.read).length;
  }, [alerts]);

  return (
    <div id="delivery-reference-style" data-theme={theme} className={menuOpen ? 'menu-open' : ''}>
      <div className="frame">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="menu-trigger"
              type="button"
              aria-label={menuOpen ? 'Close quick access menu' : 'Open quick access menu'}
              aria-controls="delivery-quick-menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span />
              <span />
              <span />
            </button>
            <div
              className="brand"
              onClick={() => navigateTo('dashboard')}
              style={{ cursor: 'pointer' }}
            >
              <span className="logo" aria-hidden="true">
                ↗
              </span>
              <span>ParcelPath</span>
            </div>
          </div>

          <div className="tools">
            {/* Notification Bell */}
            <button
              className="notif-trigger"
              type="button"
              aria-label={`Alerts and notifications (${unreadAlertsCount} unread)`}
              onClick={() => setShowNotifications(!showNotifications)}
            >
              🔔
              {unreadAlertsCount > 0 && (
                <span className="notif-badge">{unreadAlertsCount}</span>
              )}
            </button>

            {isInstallable && !isInstalled && (
              <button
                className="pwa-install-btn"
                type="button"
                onClick={install}
                title="Install ParcelPath on your home screen"
                aria-label="Install app"
              >
                📥 Install
              </button>
            )}

            <button
              className="theme"
              type="button"
              aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
              aria-pressed={theme === 'light'}
              onClick={toggleTheme}
            >
              {theme === 'light' ? '☾ Dark' : '☼ Light'}
            </button>

            <button
              className="avatar"
              type="button"
              aria-label={`Account (${currentUser ? currentUser.name : 'Sign in'})`}
              onClick={() => setIsAuthOpen(true)}
              style={{ cursor: 'pointer', border: 'none' }}
            >
              {currentUser ? currentUser.avatarInitial : 'K'}
            </button>
          </div>
        </header>

        {/* Notifications Dropdown Panel */}
        {showNotifications && (
          <aside className="notif-dropdown" aria-label="Notifications panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <strong style={{ fontSize: '13px' }}>Delivery Alerts</strong>
              <div style={{ display: 'flex', gap: '8px' }}>
                {unreadAlertsCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllAlertsRead}
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent-text)', fontSize: '10px', cursor: 'pointer' }}
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNotifications(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '14px', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
            </div>

            {alerts.length === 0 ? (
              <p style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', margin: '20px 0' }}>
                No active delivery alerts.
              </p>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`notif-item ${!alert.read ? 'is-unread' : ''}`}
                  onClick={() => handleMarkAlertRead(alert.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <strong style={{ fontSize: '11px', color: 'var(--ink)' }}>{alert.title}</strong>
                    <span style={{ fontSize: '9px', color: 'var(--muted)' }}>
                      {formatRelativeTime(alert.createdAt)}
                    </span>
                  </div>
                  <p style={{ margin: 0, color: 'var(--muted)', lineHeight: '1.4' }}>{alert.message}</p>
                </div>
              ))
            )}

            <div
              style={{
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px solid var(--line)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '10px',
              }}
            >
              <span style={{ color: 'var(--muted)' }}>
                Browser alerts:{' '}
                <strong>
                  {browserNotificationStatus === 'granted'
                    ? 'Enabled'
                    : browserNotificationStatus === 'denied'
                    ? 'Blocked'
                    : 'Not enabled'}
                </strong>
              </span>
              {browserNotificationStatus !== 'granted' && (
                <button
                  type="button"
                  onClick={handleRequestBrowserNotifications}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: 'var(--coral)',
                    color: 'var(--coral-ink)',
                    border: 'none',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Enable
                </button>
              )}
            </div>
          </aside>
        )}

        {/* Slide-out Drawer Navigation */}
        <div className="menu-overlay" aria-hidden={!menuOpen}>
          <button
            className="menu-backdrop"
            type="button"
            aria-label="Close quick access menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside
            className="menu-drawer"
            id="delivery-quick-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Quick access menu"
          >
            <div className="drawer-head">
              <p className="drawer-title">Quick access</p>
              <button
                className="drawer-close"
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                ×
              </button>
            </div>

            <p className="drawer-label">Workspace</p>
            <nav className="drawer-nav" aria-label="Quick access links">
              <button
                className="drawer-link"
                type="button"
                data-page="dashboard"
                aria-current={activePage === 'dashboard' ? 'page' : undefined}
                onClick={() => navigateTo('dashboard')}
              >
                Dashboard
              </button>
              <button
                className="drawer-link"
                type="button"
                data-page="deliveries"
                aria-current={activePage === 'deliveries' ? 'page' : undefined}
                onClick={() => navigateTo('deliveries')}
              >
                All deliveries
              </button>
              <button
                className="drawer-link"
                type="button"
                data-page="preferences"
                aria-current={activePage === 'preferences' ? 'page' : undefined}
                onClick={() => navigateTo('preferences')}
              >
                Delivery preferences
              </button>
              <button
                className="drawer-link"
                type="button"
                data-page="issues"
                aria-current={activePage === 'issues' ? 'page' : undefined}
                onClick={() => navigateTo('issues')}
              >
                Issues &amp; feedback
              </button>
              <button
                className="drawer-link"
                type="button"
                data-page="customer-care"
                aria-current={activePage === 'customer-care' ? 'page' : undefined}
                onClick={() => navigateTo('customer-care')}
              >
                Customer Care
              </button>
            </nav>

            <p className="drawer-label account-label">Account</p>
            <button
              className="drawer-link"
              type="button"
              data-page="settings"
              aria-current={activePage === 'settings' ? 'page' : undefined}
              onClick={() => navigateTo('settings')}
            >
              Settings
            </button>

            <div className="drawer-help">
              <p className="drawer-label">Help!</p>
              <button
                className="drawer-link"
                type="button"
                data-page="help"
                aria-current={activePage === 'help' ? 'page' : undefined}
                onClick={() => navigateTo('help')}
              >
                How it works
              </button>
            </div>
          </aside>
        </div>

        {/* Global Notifications / Status Banner */}
        {settingsNotice && (
          <div
            style={{
              padding: '10px 16px',
              backgroundColor: 'color-mix(in srgb, var(--accent-text) 18%, var(--surface))',
              color: 'var(--ink)',
              fontSize: '11px',
              borderBottom: '1px solid var(--line)',
              textAlign: 'center',
            }}
          >
            ✓ {settingsNotice}
          </div>
        )}

        <main>
          {/* VIEW: DASHBOARD */}
          {activePage === 'dashboard' && (
            <section className="page-view" data-page="dashboard">
              <section className="intro" aria-labelledby="delivery-greeting">
                <div>
                  <p className="eyebrow">Your delivery space</p>
                  <h1 id="delivery-greeting">Your deliveries, all in one place.</h1>
                  <p className="subtitle">Track every parcel and know when it may reach your door.</p>
                </div>
                <button
                  className="add"
                  type="button"
                  onClick={() => setIsAddOpen(true)}
                  aria-label="Add new tracking ID"
                >
                  ＋ Add tracking ID
                </button>
              </section>

              {/* Email connect photo-match banner */}
              <aside className="photo-match" aria-label="Automatically match product photos">
                <div className="photo-match-copy">
                  <span className="photo-match-icon" aria-hidden="true">
                    ▧
                  </span>
                  <div>
                    <strong>Find product pictures automatically</strong>
                    <span>
                      Connect your email to match order photos with tracking IDs. Product thumbnails appear when a matching order email is found.
                    </span>
                  </div>
                </div>
                <button
                  className="photo-connect"
                  type="button"
                  onClick={() => setIsEmailConnectOpen(true)}
                >
                  Connect email
                </button>
              </aside>

              {/* Stats summary cards */}
              <section className="stats" aria-label="Delivery summary">
                <button
                  className={`stat stat-card ${selectedStatFilter === 'active' ? 'is-selected' : ''}`}
                  type="button"
                  aria-pressed={selectedStatFilter === 'active'}
                  onClick={() => setSelectedStatFilter(selectedStatFilter === 'active' ? 'all' : 'active')}
                >
                  <span className="stat-label">Active deliveries</span>
                  <span className="stat-value">
                    {stats.activeCount} <small>in progress</small>
                  </span>
                </button>

                <button
                  className={`stat stat-card ${selectedStatFilter === 'today' ? 'is-selected' : ''}`}
                  type="button"
                  aria-pressed={selectedStatFilter === 'today'}
                  onClick={() => setSelectedStatFilter(selectedStatFilter === 'today' ? 'all' : 'today')}
                >
                  <span className="stat-label">Arriving today</span>
                  <span className="stat-value">
                    {stats.todayCount} <small>time window available</small>
                  </span>
                </button>

                <button
                  className={`stat stat-card attention ${selectedStatFilter === 'attention' ? 'is-selected' : ''}`}
                  type="button"
                  aria-pressed={selectedStatFilter === 'attention'}
                  onClick={() => setSelectedStatFilter(selectedStatFilter === 'attention' ? 'all' : 'attention')}
                >
                  <span className="stat-label">Needs attention</span>
                  <span className="stat-value">
                    {stats.attentionCount} <small>{stats.attentionCount === 1 ? 'delivery attempted' : 'items need check'}</small>
                  </span>
                </button>
              </section>

              {/* Deliveries list section */}
              <section aria-labelledby="deliveries-title">
                <div className="section-head">
                  <h2 id="deliveries-title">
                    {selectedStatFilter === 'today'
                      ? 'Arriving Today'
                      : selectedStatFilter === 'attention'
                      ? 'Parcels Needing Attention'
                      : 'Your deliveries'}
                  </h2>
                  <span className="updated">
                    {shipments[0]?.lastRefreshedAt
                      ? formatRelativeTime(shipments[0].lastRefreshedAt)
                      : 'Updated recently'}
                  </span>
                </div>

                <div className="deliveries">
                  {loadingShipments ? (
                    <div style={{ display: 'grid', gap: '9px' }}>
                      <div className="skeleton-card"><div className="skeleton-shimmer" /></div>
                      <div className="skeleton-card"><div className="skeleton-shimmer" /></div>
                      <div className="skeleton-card"><div className="skeleton-shimmer" /></div>
                    </div>
                  ) : dashboardShipments.length === 0 ? (
                    <div
                      style={{
                        padding: '36px 20px',
                        textAlign: 'center',
                        border: '1px dashed var(--line)',
                        borderRadius: '13px',
                        color: 'var(--muted)',
                        fontSize: '12px',
                      }}
                    >
                      <p style={{ margin: '0 0 12px' }}>
                        {selectedStatFilter === 'today'
                          ? 'No shipments scheduled for delivery today.'
                          : 'No parcels found in this view.'}
                      </p>
                      <button className="add" type="button" onClick={() => setIsAddOpen(true)}>
                        ＋ Add tracking ID
                      </button>
                    </div>
                  ) : (
                    dashboardShipments.map((shipment) => {
                      const isSelected = selectedDeliveryId === shipment.id;
                      const isAlert =
                        shipment.status.toLowerCase().includes('attempted') ||
                        shipment.status.toLowerCase().includes('delayed');
                      const progress = getShipmentProgress(shipment.status);
                      const isJustAdded = shipment.id === justAddedShipmentId;

                      return (
                        <article
                          key={shipment.id}
                          className={`delivery ${isSelected ? 'is-selected' : ''} ${isJustAdded ? 'parcel-just-added' : ''}`}
                        >
                          <button
                            className="delivery-select"
                            type="button"
                            aria-pressed={isSelected}
                            aria-label={`Select ${shipment.item} delivery`}
                            onClick={() => setSelectedDeliveryId(isSelected ? null : shipment.id)}
                          >
                            <span
                              className={`merchant ${!shipment.imageUrl ? 'package-placeholder' : ''}`}
                              aria-label="Product photo or placeholder"
                            >
                              {shipment.imageUrl ? (
                                <img src={shipment.imageUrl} alt={shipment.item} />
                              ) : (
                                '📦'
                              )}
                            </span>
                            <span>
                              <span className="product">
                                {shipment.item}
                                {shipment.customLabel && (
                                  <span className="custom-label-badge">
                                    🏷 {shipment.customLabel}
                                  </span>
                                )}
                              </span>
                              <span className="meta">
                                {shipment.store} · Tracking {shipment.trackingNumber}
                              </span>

                              {/* Progress bar line */}
                              <div className="delivery-progress">
                                <div className="delivery-progress-track">
                                  <div
                                    className={`delivery-progress-bar ${progress.isAlert ? 'is-alert' : ''}`}
                                    style={{ width: `${progress.percentage}%` }}
                                  />
                                </div>
                                <span className="delivery-progress-label">{progress.label}</span>
                              </div>
                            </span>

                            <span className={isAlert ? 'status alert' : 'status'}>
                              <i />
                              {shipment.status}
                            </span>
                            <span className="time">
                              <span className="eta">
                                {shipment.timeWindow || shipment.eta || 'Time not available'}
                              </span>
                              <span className="meta">
                                {shipment.timeWindow
                                  ? 'Estimated window'
                                  : isAlert
                                  ? 'A handoff may be needed'
                                  : 'Date only · Time unavailable'}
                              </span>
                            </span>
                          </button>
                          <button
                            className="details"
                            type="button"
                            aria-label={`Show details for ${shipment.item}`}
                            onClick={(e) => handleOpenDetails(shipment, e)}
                          >
                            Details ↗
                          </button>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>

              <p className="footnote">
                <strong>Arrival times are estimates.</strong> Add a backup recipient if you may be away when a parcel arrives.
              </p>
            </section>
          )}

          {/* VIEW: ALL DELIVERIES (List, Calendar, History tabs) */}
          {activePage === 'deliveries' && (
            <section className="page-view" data-page="deliveries">
              <div className="page-intro">
                <h1>All deliveries</h1>
                <p>View active parcels, arrival calendar, and completed delivery history.</p>
              </div>

              {/* Sub-nav tabs: List / Calendar / Delivery History */}
              <div className="sub-nav-tabs" role="tablist">
                <button
                  className={`sub-nav-tab ${deliveriesSubView === 'list' ? 'is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={deliveriesSubView === 'list'}
                  onClick={() => setDeliveriesSubView('list')}
                >
                  List View ({activeShipments.length})
                </button>
                <button
                  className={`sub-nav-tab ${deliveriesSubView === 'calendar' ? 'is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={deliveriesSubView === 'calendar'}
                  onClick={() => setDeliveriesSubView('calendar')}
                >
                  📅 Delivery Calendar
                </button>
                <button
                  className={`sub-nav-tab ${deliveriesSubView === 'today' ? 'is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={deliveriesSubView === 'today'}
                  onClick={() => setDeliveriesSubView('today')}
                >
                  Arriving Today ({todayShipments.length})
                </button>
                <button
                  className={`sub-nav-tab ${deliveriesSubView === 'history' ? 'is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={deliveriesSubView === 'history'}
                  onClick={() => setDeliveriesSubView('history')}
                >
                  📦 Delivery History ({deliveredShipments.length})
                </button>
              </div>

              {/* 1. LIST VIEW */}
              {deliveriesSubView === 'list' && (
                <>
                  {/* Search & Filter Toolbar */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '10px',
                      alignItems: 'center',
                      marginBottom: '20px',
                    }}
                  >
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by product, custom label, store, courier, or AWB..."
                      style={{
                        flex: '1 1 240px',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        color: 'var(--ink)',
                        fontSize: '12px',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(['all', 'attention', 'out_for_delivery', 'in_transit'] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setDeliveryFilter(f)}
                          style={{
                            padding: '7px 11px',
                            borderRadius: '7px',
                            border: '1px solid var(--line)',
                            background: deliveryFilter === f ? 'var(--coral)' : 'var(--surface)',
                            color: deliveryFilter === f ? 'var(--coral-ink)' : 'var(--ink)',
                            fontSize: '11px',
                            fontWeight: deliveryFilter === f ? 600 : 400,
                            textTransform: 'capitalize',
                            cursor: 'pointer',
                          }}
                        >
                          {f.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="settings-grid">
                    {allDeliveriesFiltered.length === 0 ? (
                      <div
                        style={{
                          gridColumn: '1 / -1',
                          padding: '30px',
                          textAlign: 'center',
                          color: 'var(--muted)',
                          fontSize: '12px',
                        }}
                      >
                        No active shipments match your search.
                      </div>
                    ) : (
                      allDeliveriesFiltered.map((s) => {
                        const isAlert =
                          s.status.toLowerCase().includes('attempted') || s.status.toLowerCase().includes('delayed');
                        const progress = getShipmentProgress(s.status);

                        return (
                          <article
                            key={s.id}
                            className="settings-card"
                            style={{ cursor: 'pointer', position: 'relative' }}
                            onClick={() => handleOpenDetails(s)}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <h2 style={{ margin: '0 0 4px' }}>
                                {s.item}
                                {s.customLabel && (
                                  <span className="custom-label-badge">🏷 {s.customLabel}</span>
                                )}
                              </h2>
                              <span style={{ fontSize: '10px', color: 'var(--accent-text)' }}>Details ↗</span>
                            </div>

                            <p className="meta" style={{ margin: '0 0 10px' }}>
                              {s.store} ({s.courierName}) · Tracking {s.trackingNumber}
                            </p>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className={isAlert ? 'status alert' : 'status'}>
                                <i />
                                {s.status}
                              </span>
                              <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                                {formatRelativeTime(s.lastRefreshedAt)}
                              </span>
                            </div>

                            {/* Progress bar line */}
                            <div className="delivery-progress" style={{ marginTop: '12px' }}>
                              <div className="delivery-progress-track">
                                <div
                                  className={`delivery-progress-bar ${progress.isAlert ? 'is-alert' : ''}`}
                                  style={{ width: `${progress.percentage}%` }}
                                />
                              </div>
                              <span className="delivery-progress-label">{progress.label}</span>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </>
              )}

              {/* 2. CALENDAR VIEW */}
              {deliveriesSubView === 'calendar' && (
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 12px' }}>
                    Select an estimated delivery date to view scheduled arrivals. Time zones are synchronized with your local time.
                  </p>

                  <div className="calendar-grid">
                    {Array.from({ length: 7 }).map((_, idx) => {
                      const d = new Date(Date.now() + (idx - 1) * 86400000);
                      const dateKey = getLocalDateStr(d);
                      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                      const dayNum = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                      const dayParcels = calendarGroupings.byDate[dateKey] || [];
                      const isToday = idx === 1;
                      const isSelected = selectedCalendarDate === dateKey;

                      return (
                        <button
                          key={dateKey}
                          className={`calendar-day ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
                          type="button"
                          onClick={() => setSelectedCalendarDate(dateKey)}
                        >
                          <div className="calendar-day-header">
                            <span>{dayName}</span>
                            {dayParcels.length > 0 && (
                              <span className="calendar-day-count">{dayParcels.length}</span>
                            )}
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 600 }}>{dayNum}</span>
                        </button>
                      );
                    })}
                  </div>

                  <h3 style={{ fontSize: '14px', fontWeight: 500, margin: '16px 0 10px' }}>
                    Arrivals on {new Date(selectedCalendarDate).toLocaleDateString('en-US', { dateStyle: 'full' })}:
                  </h3>

                  {(calendarGroupings.byDate[selectedCalendarDate] || []).length === 0 ? (
                    <div
                      style={{
                        padding: '24px',
                        borderRadius: '10px',
                        border: '1px dashed var(--line)',
                        color: 'var(--muted)',
                        fontSize: '11px',
                        textAlign: 'center',
                        marginBottom: '20px',
                      }}
                    >
                      No deliveries scheduled for this date.
                    </div>
                  ) : (
                    <div className="deliveries" style={{ marginBottom: '20px' }}>
                      {calendarGroupings.byDate[selectedCalendarDate].map((shipment) => (
                        <article key={shipment.id} className="delivery">
                          <button
                            className="delivery-select"
                            type="button"
                            onClick={() => handleOpenDetails(shipment)}
                          >
                            <span className="merchant package-placeholder">📦</span>
                            <span>
                              <span className="product">
                                {shipment.item}
                                {shipment.customLabel && (
                                  <span className="custom-label-badge">🏷 {shipment.customLabel}</span>
                                )}
                              </span>
                              <span className="meta">{shipment.store} · {shipment.courierName}</span>
                            </span>
                            <span className="status">
                              <i />
                              {shipment.status}
                            </span>
                            <span className="time">
                              <span className="eta">{shipment.timeWindow || shipment.eta || 'Time not available'}</span>
                            </span>
                          </button>
                          <button
                            className="details"
                            type="button"
                            onClick={(e) => handleOpenDetails(shipment, e)}
                          >
                            Details ↗
                          </button>
                        </article>
                      ))}
                    </div>
                  )}

                  {/* Awaiting Delivery Date Section */}
                  {calendarGroupings.awaitingDate.length > 0 && (
                    <div style={{ marginTop: '24px' }}>
                      <h3 style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)', margin: '0 0 10px' }}>
                        Awaiting delivery date ({calendarGroupings.awaitingDate.length})
                      </h3>
                      <div className="deliveries">
                        {calendarGroupings.awaitingDate.map((shipment) => (
                          <article key={shipment.id} className="delivery">
                            <button
                              className="delivery-select"
                              type="button"
                              onClick={() => handleOpenDetails(shipment)}
                            >
                              <span className="merchant package-placeholder">📦</span>
                              <span>
                                <span className="product">{shipment.item}</span>
                                <span className="meta">{shipment.store} · {shipment.courierName}</span>
                              </span>
                              <span className="status">
                                <i />
                                {shipment.status}
                              </span>
                              <span className="time">
                                <span className="eta">Carrier scan pending</span>
                              </span>
                            </button>
                            <button
                              className="details"
                              type="button"
                              onClick={(e) => handleOpenDetails(shipment, e)}
                            >
                              Details ↗
                            </button>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 3. ARRIVING TODAY PANEL */}
              {deliveriesSubView === 'today' && (
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 14px' }}>
                    Parcels scheduled for delivery today. Window estimates are provided directly by the courier.
                  </p>
                  {todayShipments.length === 0 ? (
                    <div
                      style={{
                        padding: '30px',
                        borderRadius: '12px',
                        border: '1px dashed var(--line)',
                        color: 'var(--muted)',
                        fontSize: '11px',
                        textAlign: 'center',
                      }}
                    >
                      No parcels are scheduled to arrive today.
                    </div>
                  ) : (
                    <div className="deliveries">
                      {todayShipments.map((shipment) => (
                        <article key={shipment.id} className="delivery">
                          <button
                            className="delivery-select"
                            type="button"
                            onClick={() => handleOpenDetails(shipment)}
                          >
                            <span className="merchant package-placeholder">📦</span>
                            <span>
                              <span className="product">
                                {shipment.item}
                                {shipment.customLabel && (
                                  <span className="custom-label-badge">🏷 {shipment.customLabel}</span>
                                )}
                              </span>
                              <span className="meta">{shipment.store} · {shipment.courierName}</span>
                            </span>
                            <span className="status">
                              <i />
                              {shipment.status}
                            </span>
                            <span className="time">
                              <span className="eta">{shipment.timeWindow || 'Time not available'}</span>
                              <span className="meta">
                                {shipment.timeWindow ? 'Courier window' : 'Time not available'}
                              </span>
                            </span>
                          </button>
                          <button
                            className="details"
                            type="button"
                            onClick={(e) => handleOpenDetails(shipment, e)}
                          >
                            Details ↗
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. DELIVERY HISTORY */}
              {deliveriesSubView === 'history' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '10px',
                      alignItems: 'center',
                      marginBottom: '16px',
                    }}
                  >
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search completed deliveries..."
                      style={{
                        flex: '1 1 200px',
                        padding: '8px 11px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        color: 'var(--ink)',
                        fontSize: '11px',
                      }}
                    />
                    <select
                      value={historyCourierFilter}
                      onChange={(e) => setHistoryCourierFilter(e.target.value)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        color: 'var(--ink)',
                        fontSize: '11px',
                      }}
                    >
                      <option value="all">All Couriers</option>
                      <option value="delhivery">Delhivery</option>
                      <option value="bluedart">Blue Dart</option>
                      <option value="ekart">Ekart</option>
                      <option value="dtdc">DTDC</option>
                    </select>
                  </div>

                  {Object.keys(historyByMonth).length === 0 ? (
                    <div
                      style={{
                        padding: '30px',
                        borderRadius: '12px',
                        border: '1px dashed var(--line)',
                        color: 'var(--muted)',
                        fontSize: '11px',
                        textAlign: 'center',
                      }}
                    >
                      No delivered parcels recorded in history yet.
                    </div>
                  ) : (
                    Object.entries(historyByMonth).map(([monthName, list]) => (
                      <div key={monthName} style={{ marginBottom: '24px' }}>
                        <h3
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            letterSpacing: '.04em',
                            color: 'var(--accent-text)',
                            margin: '0 0 10px',
                          }}
                        >
                          {monthName} ({list.length})
                        </h3>

                        <div className="deliveries">
                          {list.map((shipment) => (
                            <article key={shipment.id} className="delivery">
                              <button
                                className="delivery-select"
                                type="button"
                                onClick={() => handleOpenDetails(shipment)}
                              >
                                <span className="merchant package-placeholder">✓</span>
                                <span>
                                  <span className="product">
                                    {shipment.item}
                                    {shipment.customLabel && (
                                      <span className="custom-label-badge">🏷 {shipment.customLabel}</span>
                                    )}
                                  </span>
                                  <span className="meta">{shipment.store} · {shipment.courierName}</span>
                                </span>
                                <span
                                  className="status"
                                  style={{
                                    backgroundColor: 'rgba(72, 187, 120, 0.2)',
                                    color: '#48bb78',
                                  }}
                                >
                                  Delivered
                                </span>
                                <span className="time">
                                  <span className="eta">{shipment.eta}</span>
                                </span>
                              </button>
                              <button
                                className="details"
                                type="button"
                                onClick={(e) => handleOpenDetails(shipment, e)}
                              >
                                Details ↗
                              </button>
                            </article>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              <button
                className="add"
                type="button"
                style={{ marginTop: '20px' }}
                onClick={() => setIsAddOpen(true)}
              >
                ＋ Add tracking ID
              </button>
            </section>
          )}

          {/* VIEW: DELIVERY PREFERENCES */}
          {activePage === 'preferences' && (
            <section className="page-view" data-page="preferences">
              <div className="page-intro">
                <h1>Delivery preferences</h1>
                <p>Set how you would like deliveries handled when you are away.</p>
              </div>
              <form onSubmit={handleSavePreferences} className="settings-grid">
                <article className="settings-card">
                  <h2>Backup recipient</h2>
                  <label htmlFor="backup-recipient">Person who can receive eligible parcels</label>
                  <input
                    id="backup-recipient"
                    value={backupRecipient}
                    onChange={(e) => setBackupRecipient(e.target.value)}
                    placeholder="e.g. Neighbor, Gate security, Family member"
                  />
                  <div className="simple-actions">
                    <button className="primary" type="submit">
                      Save recipient
                    </button>
                  </div>
                </article>

                <article className="settings-card">
                  <h2>Delivery instructions</h2>
                  <label htmlFor="delivery-instructions">Instructions for the courier</label>
                  <textarea
                    id="delivery-instructions"
                    rows={3}
                    value={deliveryInstructions}
                    onChange={(e) => setDeliveryInstructions(e.target.value)}
                    placeholder="Add a gate, building, or handoff note (e.g. Call before delivery, drop at Flat 402)"
                  />
                  <div className="simple-actions">
                    <button className="primary" type="submit">
                      Save instructions
                    </button>
                  </div>
                </article>
              </form>

              <div
                style={{
                  marginTop: '18px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  borderLeft: '2px solid var(--coral)',
                  backgroundColor: 'color-mix(in srgb, var(--mauve) 25%, transparent)',
                  fontSize: '11px',
                  color: 'var(--muted)',
                  lineHeight: '1.45',
                }}
              >
                <strong style={{ color: 'var(--ink)' }}>Courier Preference Notice:</strong> Preferences saved on ParcelPath are kept for your planning and reference. Direct courier safe-place handover is only honored when the courier's official platform supports it.
              </div>
            </section>
          )}

          {/* VIEW: ISSUES & FEEDBACK */}
          {activePage === 'issues' && (
            <section className="page-view" data-page="issues">
              <div className="page-intro">
                <h1>Issues &amp; feedback</h1>
                <p>Get help with a parcel or tell us how the tracking experience can improve.</p>
              </div>

              <div className="support-panel" aria-label="Report an issue, give feedback, or contact support">
                <div>
                  <p className="support-kicker">We can help</p>
                  <h2>What would you like to do?</h2>
                  <p className="support-copy">
                    Report a missed delivery, delay, damaged parcel, or another delivery problem.
                  </p>
                </div>
                <div className="support-actions">
                  <button
                    className="report-issue"
                    type="button"
                    onClick={() => {
                      setPreselectedIssueShipment(null);
                      setIsReportOpen(true);
                    }}
                  >
                    Report an issue
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreselectedIssueShipment(null);
                      setIsReportOpen(true);
                    }}
                  >
                    Give feedback
                  </button>
                  <button type="button" onClick={() => navigateTo('customer-care')}>
                    Contact support
                  </button>
                </div>
              </div>

              <h2 style={{ margin: '24px 0 12px', fontSize: '15px', fontWeight: 500 }}>
                Your submitted tickets ({tickets.length})
              </h2>

              {tickets.length === 0 ? (
                <div
                  style={{
                    padding: '24px',
                    borderRadius: '12px',
                    border: '1px dashed var(--line)',
                    color: 'var(--muted)',
                    fontSize: '11px',
                    textAlign: 'center',
                  }}
                >
                  No open issues or feedback submitted yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {tickets.map((t) => (
                    <article
                      key={t.id}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: '1px solid var(--line)',
                        backgroundColor: 'color-mix(in srgb, var(--surface) 92%, var(--mauve))',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span
                            style={{
                              fontSize: '10px',
                              letterSpacing: '.08em',
                              textTransform: 'uppercase',
                              color: 'var(--accent-text)',
                              fontWeight: 600,
                            }}
                          >
                            {t.ticketRef} · {t.category.replace('_', ' ')}
                          </span>
                          <h3 style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: 500 }}>{t.subject}</h3>
                        </div>
                        <span
                          style={{
                            padding: '4px 8px',
                            borderRadius: '99px',
                            fontSize: '10px',
                            fontWeight: 600,
                            backgroundColor:
                              t.status === 'Resolved'
                                ? 'rgba(72, 187, 120, 0.2)'
                                : 'color-mix(in srgb, var(--accent-text) 20%, transparent)',
                            color: t.status === 'Resolved' ? '#48bb78' : 'var(--accent-text)',
                          }}
                        >
                          {t.status}
                        </span>
                      </div>
                      <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'var(--muted)', lineHeight: '1.45' }}>
                        {t.description}
                      </p>
                      {t.shipmentLabel && (
                        <p style={{ margin: '6px 0 0', fontSize: '10px', color: 'var(--muted)' }}>
                          Related parcel: <strong>{t.shipmentLabel}</strong>
                        </p>
                      )}
                      {t.staffReply && (
                        <div
                          style={{
                            marginTop: '10px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--surface-raised)',
                            borderLeft: '2px solid #48bb78',
                            fontSize: '11px',
                          }}
                        >
                          <strong>Support reply:</strong> {t.staffReply}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* VIEW: CUSTOMER CARE */}
          {activePage === 'customer-care' && (
            <section className="page-view" data-page="customer-care">
              <div className="page-intro">
                <h1>Customer Care</h1>
                <p>Help with parcel delays, missed delivery attempts, tracking problems, or damaged items.</p>
              </div>
              <div className="care-grid">
                <article className="care-card">
                  <h2>Contact details</h2>
                  <p>Official support channels for the ParcelPath tracking platform.</p>
                  <div className="care-detail">
                    <span>Email</span>
                    <strong>{supportConfig.supportEmail}</strong>
                  </div>
                  <div className="care-detail">
                    <span>Phone / WhatsApp</span>
                    <strong>{supportConfig.supportPhone}</strong>
                  </div>
                  <div className="care-detail">
                    <span>Hours</span>
                    <strong>{supportConfig.hours}</strong>
                  </div>
                  <div className="simple-actions">
                    <button
                      className="primary"
                      type="button"
                      onClick={() => {
                        setPreselectedIssueShipment(null);
                        setIsReportOpen(true);
                      }}
                    >
                      Contact support
                    </button>
                  </div>
                </article>

                <article className="care-card">
                  <h2>Before you contact us</h2>
                  <p>Including these details can help Customer Care understand the issue.</p>
                  <div className="care-detail">
                    <span>Tracking ID</span>
                    <strong>For the affected parcel (Courier AWB)</strong>
                  </div>
                  <div className="care-detail">
                    <span>Issue</span>
                    <strong>Delay, missed attempt, damage, or other</strong>
                  </div>
                  <div className="care-detail">
                    <span>Details</span>
                    <strong>What happened and when</strong>
                  </div>
                  <div className="simple-actions">
                    <button
                      className="primary"
                      type="button"
                      onClick={() => {
                        setPreselectedIssueShipment(null);
                        setIsReportOpen(true);
                      }}
                    >
                      Report a delivery issue
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreselectedIssueShipment(null);
                        setIsReportOpen(true);
                      }}
                    >
                      Send feedback
                    </button>
                  </div>
                </article>
              </div>
            </section>
          )}

          {/* VIEW: ACCOUNT SETTINGS */}
          {activePage === 'settings' && (
            <section className="page-view" data-page="settings">
              <div className="page-intro">
                <h1>Account settings</h1>
                <p>Update your account information and preferences.</p>
              </div>
              <div className="settings-grid">
                <article className="settings-card">
                  <h2>Personal information</h2>
                  <form onSubmit={handleSaveAccountSettings}>
                    <label htmlFor="account-name">Name</label>
                    <input
                      id="account-name"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                    />
                    <label htmlFor="account-email">Email address</label>
                    <input
                      id="account-email"
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      placeholder="Your email address"
                    />
                    <div className="simple-actions">
                      <button className="primary" type="submit">
                        Save changes
                      </button>
                    </div>
                  </form>
                </article>

                <article className="settings-card">
                  <h2>Appearance</h2>
                  <p className="support-copy">
                    Use the light/dark control in the top bar to change the dashboard theme. Current mode: <strong>{theme}</strong>.
                  </p>

                  <h2 style={{ marginTop: '20px' }}>Notifications</h2>
                  <label>
                    <input
                      type="checkbox"
                      checked={statusNotification}
                      onChange={(e) => setStatusNotification(e.target.checked)}
                    />
                    Delivery status updates
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={arrivalNotification}
                      onChange={(e) => setArrivalNotification(e.target.checked)}
                    />
                    Arrival reminders
                  </label>

                  <div style={{ marginTop: '12px' }}>
                    <button
                      className="details"
                      type="button"
                      onClick={handleRequestBrowserNotifications}
                    >
                      {browserNotificationStatus === 'granted'
                        ? '✓ Browser Notifications Active'
                        : 'Enable Browser Web Push'}
                    </button>
                  </div>

                  <h2 style={{ marginTop: '20px' }}>Progressive Web App</h2>
                  <p className="support-copy">
                    {isInstalled
                      ? '✓ ParcelPath is running in standalone installed app mode.'
                      : isInstallable
                      ? 'ParcelPath is ready to install on your desktop or mobile home screen.'
                      : 'Installable via your browser menu (Add to Home Screen).'}
                  </p>
                  {isInstallable && !isInstalled && (
                    <div className="simple-actions" style={{ marginTop: '8px' }}>
                      <button className="primary" type="button" onClick={install}>
                        Install ParcelPath
                      </button>
                    </div>
                  )}

                  <h2 style={{ marginTop: '20px', color: '#fc8181' }}>Delete Account</h2>
                  <p className="support-copy">
                    Permanently delete your profile, saved tracking numbers, and support history.
                  </p>
                  <div className="simple-actions" style={{ marginTop: '8px' }}>
                    <button className="danger" type="button" onClick={handleDeleteAccount}>
                      Delete account &amp; all data
                    </button>
                  </div>
                </article>
              </div>
            </section>
          )}

          {/* VIEW: HELP / HOW IT WORKS */}
          {activePage === 'help' && (
            <section className="page-view" data-page="help">
              <div className="page-intro">
                <h1>How this website works</h1>
                <p>Follow these steps to keep track of your parcels and plan for delivery.</p>
              </div>
              <div className="steps" aria-label="How delivery tracking works">
                <article className="step">
                  <span className="step-number">1</span>
                  <div>
                    <h2>Add a tracking ID</h2>
                    <p>
                      Paste the courier tracking ID (AWB) and choose the courier if the website cannot identify it automatically. Shopping order numbers from Amazon or Flipkart need to be replaced with the courier AWB once dispatched.
                    </p>
                  </div>
                </article>
                <article className="step">
                  <span className="step-number">2</span>
                  <div>
                    <h2>Save multiple parcels</h2>
                    <p>
                      Add tracking IDs from different shopping platforms. Add custom tags like “Birthday gift” or “Urgent” to organize them.
                    </p>
                  </div>
                </article>
                <article className="step">
                  <span className="step-number">3</span>
                  <div>
                    <h2>Check delivery updates &amp; calendar</h2>
                    <p>
                      See courier status updates, progress lines, and view scheduled deliveries on the interactive calendar.
                    </p>
                  </div>
                </article>
                <article className="step">
                  <span className="step-number">4</span>
                  <div>
                    <h2>Plan the handoff</h2>
                    <p>
                      Use “I won’t be home” to check official courier rescheduling policies or specify backup recipient preferences.
                    </p>
                  </div>
                </article>
                <article className="step">
                  <span className="step-number">5</span>
                  <div>
                    <h2>Get help if something goes wrong</h2>
                    <p>
                      Report a missed delivery or another parcel issue directly from the order details, or contact Customer Care.
                    </p>
                  </div>
                </article>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Modals */}
      <AddDeliveryModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={(newShipment) => {
          setShipments((prev) => [newShipment, ...prev]);
          setJustAddedShipmentId(newShipment.id);
          setTimeout(() => setJustAddedShipmentId(null), 1800);
          setSettingsNotice(`Saved new parcel: ${newShipment.item}`);
          setTimeout(() => setSettingsNotice(null), 3000);
        }}
        sessionToken={sessionToken}
      />

      <OrderDetailsModal
        isOpen={isDetailsOpen}
        shipment={activeDetailShipment}
        onClose={() => setIsDetailsOpen(false)}
        onReportIssue={(shipment) => {
          setPreselectedIssueShipment(shipment);
          setIsReportOpen(true);
        }}
        onDeleteShipment={handleDeleteShipment}
        onRefreshShipment={handleRefreshShipment}
        onUpdateLabel={handleUpdateLabel}
        sessionToken={sessionToken}
      />

      <ReportIssueModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        shipments={shipments}
        preselectedShipment={preselectedIssueShipment}
        onSuccess={(ticket) => {
          setTickets((prev) => [ticket, ...prev]);
          setSettingsNotice(`Ticket ${ticket.ticketRef} submitted successfully.`);
          setTimeout(() => setSettingsNotice(null), 4000);
          setActivePage('issues');
        }}
        sessionToken={sessionToken}
      />

      <EmailConnectModal
        isOpen={isEmailConnectOpen}
        onClose={() => setIsEmailConnectOpen(false)}
        sessionToken={sessionToken}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        currentUser={currentUser}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
      />
    </div>
  );
}
