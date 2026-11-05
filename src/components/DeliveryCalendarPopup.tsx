import React, { useState, useEffect, useMemo } from 'react';
import { Shipment } from '../types';
import { getIstDateParts, getIstDateStr, msUntilNextIstMidnight } from '../utils/istDate';

interface DeliveryCalendarPopupProps {
  isOpen: boolean;
  onClose: () => void;
  shipments: Shipment[];
  onOpenDetails: (shipment: Shipment) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const DeliveryCalendarPopup: React.FC<DeliveryCalendarPopupProps> = ({
  isOpen,
  onClose,
  shipments,
  onOpenDetails,
}) => {
  // Current IST date state (moves automatically at midnight)
  const [istTodayStr, setIstTodayStr] = useState<string>(() => getIstDateStr());

  // Current viewed month & year in popup
  const [viewYear, setViewYear] = useState<number>(() => getIstDateParts().year);
  const [viewMonth, setViewMonth] = useState<number>(() => getIstDateParts().month);

  // Selected date in calendar view
  const [selectedDate, setSelectedDate] = useState<string>(() => getIstDateStr());

  // Automatic midnight rollover in IST even if the popup stays open
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const scheduleNextMidnight = () => {
      const ms = msUntilNextIstMidnight();
      timeoutId = setTimeout(() => {
        const nextIst = getIstDateStr();
        setIstTodayStr(nextIst);
        scheduleNextMidnight();
      }, ms + 200);
    };

    scheduleNextMidnight();

    // Also poll every 10 seconds as a reliable backup
    const intervalId = setInterval(() => {
      const current = getIstDateStr();
      setIstTodayStr((prev) => (prev !== current ? current : prev));
    }, 10000);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, []);

  // When popup opens, sync selected date to today if none selected
  useEffect(() => {
    if (isOpen) {
      const currentIst = getIstDateParts();
      setIstTodayStr(currentIst.dateStr);
      setViewYear(currentIst.year);
      setViewMonth(currentIst.month);
      setSelectedDate(currentIst.dateStr);
    }
  }, [isOpen]);

  // Group active/scheduled parcels by estimatedDate
  // Leave undated parcels off the calendar; count each parcel once
  const parcelsByDate = useMemo(() => {
    const map: Record<string, Shipment[]> = {};
    for (const s of shipments) {
      if (s.isArchived) continue;
      // Undated parcels are excluded from calendar
      if (!s.estimatedDate || !/^\d{4}-\d{2}-\d{2}$/.test(s.estimatedDate.trim())) {
        continue;
      }
      const key = s.estimatedDate.trim();
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [shipments]);

  if (!isOpen) return null;

  // Month calculations
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleTodayClick = () => {
    const todayParts = getIstDateParts();
    setViewYear(todayParts.year);
    setViewMonth(todayParts.month);
    setSelectedDate(todayParts.dateStr);
  };

  const selectedDateParcels = parcelsByDate[selectedDate] || [];

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="custom-modal delivery-calendar-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-modal-title"
        style={{ maxWidth: '640px', width: '92%' }}
      >
        <div className="dialog-content">
          {/* Header */}
          <div className="dialog-head" style={{ paddingBottom: '12px' }}>
            <div>
              <p className="dialog-kicker">Delivery Schedule</p>
              <h2 id="calendar-modal-title" style={{ fontSize: '18px', margin: 0 }}>
                Delivery Calendar
              </h2>
              <p className="dialog-sub" style={{ margin: '3px 0 0', fontSize: '11px' }}>
                All dates synchronized with India Standard Time (IST).
              </p>
            </div>
            <button
              className="dialog-close"
              type="button"
              onClick={onClose}
              aria-label="Close calendar"
            >
              ×
            </button>
          </div>

          {/* Month Controls Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              margin: '14px 0 12px',
              padding: '6px 8px',
              borderRadius: '8px',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="Previous month"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  color: 'var(--ink)',
                  width: '30px',
                  height: '30px',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '14px',
                }}
              >
                ‹
              </button>
              <strong style={{ fontSize: '14px', minWidth: '150px' }}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </strong>
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="Next month"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  color: 'var(--ink)',
                  width: '30px',
                  height: '30px',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '14px',
                }}
              >
                ›
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleTodayClick}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  background: 'var(--surface-raised)',
                  color: 'var(--ink)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Today
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  background: 'transparent',
                  color: 'var(--muted)',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>

          {/* Weekday Labels */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '4px',
              textAlign: 'center',
              marginBottom: '6px',
            }}
          >
            {WEEKDAYS.map((day) => (
              <span
                key={day}
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {day}
              </span>
            ))}
          </div>

          {/* Monthly Calendar Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '4px',
            }}
          >
            {/* Blank cells for offset */}
            {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
              <div
                key={`empty-${idx}`}
                style={{
                  minHeight: '62px',
                  borderRadius: '6px',
                  background: 'transparent',
                }}
              />
            ))}

            {/* Day cells 1 to daysInMonth */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const dayParcels = parcelsByDate[dateKey] || [];
              const orderCount = dayParcels.length;
              const isToday = dateKey === istTodayStr;
              const isSelected = dateKey === selectedDate;
              const hasDeliveries = orderCount > 0;

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => setSelectedDate(dateKey)}
                  style={{
                    minHeight: '62px',
                    padding: '5px 4px',
                    borderRadius: '7px',
                    border: isToday
                      ? '2px solid var(--coral, #e76f51)'
                      : isSelected
                      ? '1px solid var(--accent-text)'
                      : '1px solid var(--line)',
                    background: isSelected
                      ? 'color-mix(in srgb, var(--accent-text) 14%, var(--surface))'
                      : hasDeliveries
                      ? 'color-mix(in srgb, #8b5e3c 15%, var(--surface))'
                      : 'var(--surface)',
                    color: 'var(--ink)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    transition: 'border-color 0.15s ease',
                    boxShadow: isToday ? '0 0 0 1px var(--coral, #e76f51)' : 'none',
                    position: 'relative',
                  }}
                  aria-label={`${dateKey}${isToday ? ' (Today IST)' : ''}: ${orderCount} deliveries`}
                >
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: isToday ? 800 : 600,
                      color: isToday ? 'var(--coral, #e76f51)' : 'var(--ink)',
                    }}
                  >
                    {dayNum}
                  </span>

                  {/* Count directly beneath date */}
                  {hasDeliveries && (
                    <span
                      style={{
                        marginTop: '3px',
                        fontSize: '9px',
                        fontWeight: 600,
                        color: 'var(--amber, #d97706)',
                        lineHeight: 1.2,
                        textAlign: 'center',
                        wordBreak: 'break-word',
                      }}
                    >
                      {orderCount} {orderCount === 1 ? 'order' : 'orders'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '16px 0 12px' }} />

          {/* Selected Date Deliveries List */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ fontSize: '13px', margin: 0, fontWeight: 600 }}>
                Deliveries on {new Date(selectedDate + 'T12:00:00Z').toLocaleDateString('en-US', {
                  timeZone: 'Asia/Kolkata',
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                {selectedDate === istTodayStr && (
                  <span
                    style={{
                      marginLeft: '8px',
                      fontSize: '10px',
                      color: 'var(--coral)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  >
                    (Today IST)
                  </span>
                )}
              </h3>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {selectedDateParcels.length} {selectedDateParcels.length === 1 ? 'order' : 'orders'}
              </span>
            </div>

            {selectedDateParcels.length === 0 ? (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  borderRadius: '8px',
                  border: '1px dashed var(--line)',
                  color: 'var(--muted)',
                  fontSize: '12px',
                }}
              >
                No deliveries scheduled.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px', maxHeight: '230px', overflowY: 'auto' }}>
                {selectedDateParcels.map((parcel) => (
                  <div
                    key={parcel.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      background: 'var(--page)',
                      gap: '10px',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong style={{ display: 'block', fontSize: '12px', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {parcel.item}
                        {parcel.customLabel && (
                          <span className="custom-label-badge" style={{ marginLeft: '6px' }}>🏷 {parcel.customLabel}</span>
                        )}
                      </strong>
                      <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                        {parcel.store} ({parcel.courierName}) · {parcel.trackingNumber} · {parcel.timeWindow || parcel.eta || 'Time not provided'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span className="status" style={{ fontSize: '10px', padding: '2px 7px' }}>
                        <i />
                        {parcel.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenDetails(parcel);
                        }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--line)',
                          background: 'var(--surface)',
                          color: 'var(--accent-text)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Details ↗
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
