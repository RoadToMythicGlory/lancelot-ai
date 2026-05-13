'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer, View, Event } from 'react-big-calendar';
import moment from 'moment';
import { useQuery, useMutation, gql } from '@apollo/client';
import { App } from 'antd';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../styles/calendar.css';
import '../styles/calendar-override.css';
import '../styles/calendar-overlap-only.css';
import '../styles/calendar-time-indicator.css';
import '../styles/calendar-jewish-holidays.css';

import EventForm from './EventForm';
import { BroadcastType, MCREvent } from '../types';
import { GET_BROADCAST_EVENTS } from '@/graphql/queries';
import { CREATE_MCR_EVENT, UPDATE_MCR_EVENT } from '@/graphql/mcrMutations';
import { getJewishHolidays } from '../utils/jewishHolidays';

const localizer = momentLocalizer(moment);

// GraphQL queries
const GET_MCR_EVENTS = gql`
  query GetMCREvents($start: DateTime!, $end: DateTime!) {
    mcrEvents(start: $start, end: $end) {
      id
      title
      start
      end
      broadcastType
      isMCROnly
      broadcastEventId
      details {
        ip
        port
        passphrase
        contact
        notes
        satelliteConfig
        fileContent
        filePath
        cameraCount
      }
      createdBy {
        id
        displayName
      }
    }
  }
`;

// Color mapping for broadcast types
const broadcastTypeColors: Record<BroadcastType, string> = {
  'SRT_CALLER': '#7ca13d',
  'SRT_LISTENER': '#a8cc6a',
  'DVBS2': '#ed80e8',
  'DVBS2X': '#54b0c7',
  'NS3': '#1b943b',
  'NS4': '#1b943b',
  'RTMP': '#d46eab',
  'ZIXI': '#ff6b6b',
  'LIVEU': '#e8ca92',
  'PRT': '#c2e8ed',
  'KLITA_MOU': '#b135de',
  'OTHER': '#e31464',
};

export default function CalendarWidget() {
  const [view, setView] = useState<string>('week');
  const [selectedEvent, setSelectedEvent] = useState<MCREvent | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [events, setEvents] = useState<MCREvent[]>([]);
  const [date, setDate] = useState(new Date());
  const [, forceUpdate] = useState({});
  const { message } = App.useApp();

  useEffect(() => {
    setView('week');
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      forceUpdate({});
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Calculate date range for queries
  const getDateRange = () => {
    const start = new Date(date);
    const end = new Date(date);
    
    if (view === 'day') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (view === 'week') {
      start.setDate(date.getDate() - date.getDay());
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (view === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(start.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
    } else {
      // agenda view - show next 30 days
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 30);
      end.setHours(23, 59, 59, 999);
    }
    
    return { start, end };
  };

  const { start: startDate, end: endDate } = getDateRange();

  // Fetch MCR events
  const { data: mcrData, loading: mcrLoading, refetch: refetchMCR } = useQuery(GET_MCR_EVENTS, {
    variables: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
  });

  // Fetch broadcast events
  const { data: broadcastData, loading: broadcastLoading, refetch: refetchBroadcast } = useQuery(GET_BROADCAST_EVENTS, {
    variables: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
  });

  // Mutations
  const [createMCREvent] = useMutation(CREATE_MCR_EVENT);
  const [updateMCREvent] = useMutation(UPDATE_MCR_EVENT);

  useEffect(() => {
    const combinedEvents: MCREvent[] = [];
    
    // Add MCR events (but not those linked to broadcasts - they'll be handled below)
    if (mcrData?.mcrEvents) {
      mcrData.mcrEvents.forEach((event: any) => {
        // Only add MCR events that are NOT linked to a broadcast event
        if (!event.broadcastEventId) {
        combinedEvents.push({
          ...event,
          start: new Date(event.start),
          end: new Date(event.end),
        });
        }
      });
    }
    
    // Add broadcast events
    if (broadcastData?.broadcastEvents) {
      broadcastData.broadcastEvents.forEach((broadcast: any, index: number) => {
        const startDate = new Date(broadcast.startTime);
        const endDate = new Date(broadcast.endTime);
        
        // Check if there's already an MCR event for this broadcast
        const linkedMCREvent = mcrData?.mcrEvents?.find((mcrEvent: any) => 
          mcrEvent.broadcastEventId === broadcast.id
        );
        
        if (linkedMCREvent) {
          // If MCR event exists, merge its data with broadcast data
          combinedEvents.push({
            ...linkedMCREvent,
            id: `broadcast-${broadcast.id}`,
            title: broadcast.title,
            start: startDate,
            end: endDate,
            isMCROnly: false,
            // Preserve the actual MCR event ID for updates
            _mcrEventId: linkedMCREvent.id,
          });
        } else {
          // No MCR event yet, create a basic broadcast event
        const eventToAdd = {
          id: `broadcast-${broadcast.id}`,
          title: broadcast.title,
          start: startDate,
          end: endDate,
          // Do not force a broadcastType so default styling (blue) applies
          broadcastType: undefined,
          isMCROnly: false,
          details: {
            notes: `Channel: ${broadcast.channel || 'N/A'}\nStatus: ${broadcast.status || 'N/A'}${broadcast.notes ? '\n' + broadcast.notes : ''}`,
          },
        };
        
        combinedEvents.push(eventToAdd);
        }
      });
    }
    
    // Add Jewish holidays
    try {
      const holidays = getJewishHolidays(startDate, endDate);
      holidays.forEach((holiday) => {
        combinedEvents.push({
          id: holiday.id,
          title: holiday.hebrewTitle,
          start: holiday.date,
          end: new Date(holiday.date.getTime() + 60 * 60 * 1000), // 1 hour duration
          broadcastType: undefined,
          isMCROnly: false,
          _isHoliday: true,
          _holidayInfo: holiday,
        } as any);
      });
    } catch {
      // Holiday fetch failed silently — non-critical
    }
    
    setEvents(combinedEvents);
  }, [mcrData, broadcastData, mcrLoading, broadcastLoading, date, view]);

  // Refetch when date or view changes
  useEffect(() => {
    if (refetchMCR && refetchBroadcast) {
      refetchMCR();
      refetchBroadcast();
    }
  }, [date, view, refetchMCR, refetchBroadcast]);

  const viewOptions = [
    { value: 'day', label: 'תצוגה יומית' },
    { value: 'week', label: 'תצוגה שבועית' },
    { value: 'month', label: 'תצוגה חודשית' },
  ];

  const handleSelectEvent = (event: MCREvent) => {
    // Don't allow editing Jewish holidays
    if ((event as any)._isHoliday) {
      return;
    }
    setSelectedEvent(event);
    setShowEventForm(true);
  };

  const handleCreateEvent = (slotInfo: any) => {
    const newEvent: MCREvent = {
      id: '',
      title: 'אירוע חדש',
      start: slotInfo.start,
      end: slotInfo.end,
      broadcastType: undefined,
      isMCROnly: true,
    };
    setSelectedEvent(newEvent);
    setShowEventForm(true);
  };

  const eventStyleGetter = (event: MCREvent) => {
    // Special styling for Jewish holidays
    if ((event as any)._isHoliday) {
      const holidayInfo = (event as any)._holidayInfo;
      const isYomTov = holidayInfo?.isYomTov;
      const isMajor = holidayInfo?.isMajor;
      
      return {
        style: {
          background: isYomTov ? '#8B4513' : (isMajor ? '#DAA520' : '#F0E68C'),
          backgroundColor: isYomTov ? '#8B4513' : (isMajor ? '#DAA520' : '#F0E68C'),
          borderRadius: '4px',
          opacity: 0.9,
          color: isYomTov ? 'white' : '#333',
          border: '2px solid ' + (isYomTov ? '#654321' : '#B8860B'),
          fontWeight: '600',
          fontSize: '0.7rem',
          padding: '2px 4px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          cursor: 'default',
          lineHeight: '1.2',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontStyle: 'italic',
        },
      };
    }
    
    // Regular event styling
    const backgroundColor = (event.broadcastType && broadcastTypeColors[event.broadcastType as keyof typeof broadcastTypeColors]) ?? '#3174ad';
    return {
      style: {
        background: backgroundColor,
        backgroundColor: backgroundColor,
        borderRadius: '4px',
        opacity: 1,
        color: 'white',
        border: '1px solid rgba(0,0,0,0.2)',
        fontWeight: '500',
        fontSize: '0.75rem',
        padding: '3px 6px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        cursor: 'pointer',
        lineHeight: '1.3',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
    };
  };

  const handleNavigate = (action: 'TODAY' | 'PREV' | 'NEXT') => {
    if (action === 'TODAY') {
      setDate(new Date());
    } else if (action === 'PREV') {
      setDate(prevDate => {
        const newDate = new Date(prevDate);
        if (view === 'day') {
          newDate.setDate(newDate.getDate() - 1);
        } else if (view === 'week') {
          newDate.setDate(newDate.getDate() - 7);
        } else if (view === 'month') {
          newDate.setMonth(newDate.getMonth() - 1);
        } else if (view === 'agenda') {
          // For agenda view, go back 1 month
          newDate.setMonth(newDate.getMonth() - 1);
        }
        return newDate;
      });
    } else if (action === 'NEXT') {
      setDate(prevDate => {
        const newDate = new Date(prevDate);
        if (view === 'day') {
          newDate.setDate(newDate.getDate() + 1);
        } else if (view === 'week') {
          newDate.setDate(newDate.getDate() + 7);
        } else if (view === 'month') {
          newDate.setMonth(newDate.getMonth() + 1);
        } else if (view === 'agenda') {
          // For agenda view, go forward 1 month
          newDate.setMonth(newDate.getMonth() + 1);
        }
        return newDate;
      });
    }
  };

  const getDateRangeText = () => {
    const options: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    
    if (view === 'day') {
      return date.toLocaleDateString('he-IL', options);
    } else if (view === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return `${weekStart.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })} - ${weekEnd.toLocaleDateString('he-IL', options)}`;
    } else if (view === 'month') {
      return date.toLocaleDateString('he-IL', { year: 'numeric', month: 'long' });
    } else if (view === 'agenda') {
      // For agenda view, show current month
      return date.toLocaleDateString('he-IL', { year: 'numeric', month: 'long' });
    } else {
      return date.toLocaleDateString('he-IL', options);
    }
  };

  return (
    <div className="h-full bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">לוח שנה</h2>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => window.open('/MCR/calendar-fullscreen', '_blank')}
                className="px-3 py-2 bg-blue-800 text-white rounded-lg font-medium hover:bg-blue-900 transition-all flex items-center gap-2"
                title="פתח במסך מלא"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                מסך מלא
              </button>
              {viewOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setView(option.value)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    view === option.value
                      ? 'bg-white text-blue-600 shadow-lg transform scale-105'
                      : 'bg-blue-500 text-white hover:bg-blue-400'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <button
                onClick={() => handleNavigate('PREV')}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-400 transition-colors"
                title="הקודם"
              >
                ←
              </button>
              <button
                onClick={() => handleNavigate('TODAY')}
                className="px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-400 transition-colors"
              >
                היום
              </button>
              <button
                onClick={() => handleNavigate('NEXT')}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-400 transition-colors"
                title="הבא"
              >
                →
              </button>
            </div>
            <span className="text-white font-medium text-lg">
              {getDateRangeText()}
            </span>
          </div>
        </div>
      </div>
      
      <div className="flex-1 mcr-calendar bg-white p-4 min-h-0">
        {(mcrLoading || broadcastLoading) ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">טוען אירועים...</div>
          </div>
        ) : (
          <>
            <div className="mb-2 text-sm text-gray-600">
              מציג {events.length} אירועים בתצוגת {view}
            </div>
            <Calendar
          localizer={localizer}
          events={events}
          defaultView='week'
          view={view === 'agenda' ? 'week' : view}
          views={['month', 'week', 'day']}
          onView={(newView) => setView(newView)}
          date={date}
          onNavigate={setDate}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleCreateEvent}
          selectable
          eventPropGetter={eventStyleGetter}
          style={{ height: 'calc(100% - 20px)' }}
          scrollToTime={new Date(1970, 1, 1, 8)}
          dayLayoutAlgorithm='no-overlap'
          showCurrentTime={true}
          messages={{
            today: 'היום',
            previous: 'הקודם',
            next: 'הבא',
            month: 'חודש',
            week: 'שבוע',
            day: 'יום',
            agenda: 'סדר יום',
            date: 'תאריך',
            time: 'זמן',
            event: 'אירוע',
            showMore: (total: number) => `+${total} עוד`,
          }}
          formats={{
            dayFormat: 'ddd DD',
            dayHeaderFormat: 'ddd MM/DD',
            weekdayFormat: 'ddd',
          }}
          rtl={true}
          toolbar={false}
        />
          </>
        )}
      </div>

      {showEventForm && selectedEvent && (
        <EventForm
          event={selectedEvent}
          onClose={() => {
            setShowEventForm(false);
            setSelectedEvent(null);
          }}
          onSave={async (updatedEvent) => {
            try {
              const token = localStorage.getItem('auth-token');
              if (!token) {
                message.error('יש להתחבר למערכת כדי לשמור אירועים');
                window.location.href = '/login';
                return;
              }

              // Clean the details object to remove __typename and filter out undefined values
              const cleanDetails = updatedEvent.details ? 
                Object.entries(updatedEvent.details).reduce((acc, [key, value]) => {
                  // Skip __typename and undefined/null values
                  if (key !== '__typename' && value !== undefined && value !== null && value !== '') {
                    acc[key] = value;
                  }
                  return acc;
                }, {} as any) : null;
              
              // Only include details if it has any properties
              const finalDetails = cleanDetails && Object.keys(cleanDetails).length > 0 ? cleanDetails : null;

              // Check if we're editing a broadcast event (starts with 'broadcast-')
              const isBroadcastEvent = updatedEvent.id && updatedEvent.id.startsWith('broadcast-');
              
              if (isBroadcastEvent) {
                const broadcastId = updatedEvent.id.replace('broadcast-', '');
                const existingMCREvent = mcrData?.mcrEvents?.find((mcrEvent: any) => 
                  mcrEvent.broadcastEventId === broadcastId
                );
                
                const mcrEventId = (updatedEvent as any)._mcrEventId || existingMCREvent?.id;
                
                if (mcrEventId) {
                  const { data } = await updateMCREvent({
                    variables: {
                      id: mcrEventId,
                      input: {
                        title: updatedEvent.title,
                        start: updatedEvent.start.toISOString(),
                        end: updatedEvent.end.toISOString(),
                        broadcastType: updatedEvent.broadcastType || null,
                        isMCROnly: false,
                        details: finalDetails,
                      },
                    },
                  });
                  
                  if (!data || !data.updateMCREvent) {
                    throw new Error('Update mutation returned no data');
                  }
                } else {
                  const { data } = await createMCREvent({
                    variables: {
                      input: {
                        title: updatedEvent.title,
                        start: updatedEvent.start.toISOString(),
                        end: updatedEvent.end.toISOString(),
                        broadcastType: updatedEvent.broadcastType || null,
                        isMCROnly: false,
                        details: finalDetails,
                        broadcastEventId: broadcastId,
                      },
                    },
                  });
                  
                  if (!data || !data.createMCREvent) {
                    throw new Error('Create mutation returned no data');
                  }
                }
              } else if (updatedEvent.id && events.find(e => e.id === updatedEvent.id)) {
                const { data } = await updateMCREvent({
                  variables: {
                    id: updatedEvent.id,
                    input: {
                      title: updatedEvent.title,
                      start: updatedEvent.start.toISOString(),
                      end: updatedEvent.end.toISOString(),
                      broadcastType: updatedEvent.broadcastType || null,
                      isMCROnly: updatedEvent.isMCROnly,
                      details: finalDetails,
                    },
                  },
                });
                
                if (!data || !data.updateMCREvent) {
                  throw new Error('Update mutation returned no data');
                }
            } else {
                const { data } = await createMCREvent({
                  variables: {
                    input: {
                      title: updatedEvent.title,
                      start: updatedEvent.start.toISOString(),
                      end: updatedEvent.end.toISOString(),
                      broadcastType: updatedEvent.broadcastType || null,
                      isMCROnly: updatedEvent.isMCROnly !== undefined ? updatedEvent.isMCROnly : true,
                      details: finalDetails,
                    },
                  },
                });
                
                if (!data || !data.createMCREvent) {
                  throw new Error('Create mutation returned no data');
                }
              }

              await refetchMCR();
            setShowEventForm(false);
            setSelectedEvent(null);
            } catch (error: any) {
              if (error.graphQLErrors?.length > 0) {
                const graphQLError = error.graphQLErrors[0];
                if (graphQLError.message.includes('createdBy')) {
                  message.error('שגיאת אימות: אנא התחבר מחדש למערכת');
                  window.location.href = '/login';
                } else {
                  message.error('שגיאה: ' + graphQLError.message);
                }
              } else if (error.networkError) {
                message.error('שגיאת רשת. אנא בדוק את החיבור שלך.');
              } else {
                message.error('שגיאה בשמירת האירוע. אנא נסה שנית.');
              }
            }
          }}
        />
      )}
    </div>
  );
}
