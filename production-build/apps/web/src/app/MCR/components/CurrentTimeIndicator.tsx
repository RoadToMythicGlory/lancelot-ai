'use client';

import React, { useState, useEffect } from 'react';
import moment from 'moment';

interface CurrentTimeIndicatorProps {
  view: string;
}

export default function CurrentTimeIndicator({ view }: CurrentTimeIndicatorProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Update every minute
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Only show in day or week view
  if (view !== 'day' && view !== 'week') {
    return null;
  }

  // Calculate position based on current time
  const now = moment();
  const startOfDay = moment().startOf('day').hour(0);
  const endOfDay = moment().startOf('day').hour(24);
  const totalMinutes = endOfDay.diff(startOfDay, 'minutes');
  const currentMinutes = now.diff(startOfDay, 'minutes');
  const percentageOfDay = (currentMinutes / totalMinutes) * 100;

  return (
    <>
      <div 
        className="rbc-current-time-indicator"
        style={{
          position: 'absolute',
          top: `${percentageOfDay}%`,
          left: 0,
          right: 0,
          height: '2px',
          backgroundColor: '#ff0000',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50px', // Align with time gutter
            top: '-4px',
            width: '10px',
            height: '10px',
            backgroundColor: '#ff0000',
            borderRadius: '50%',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          top: `${percentageOfDay}%`,
          left: '0',
          transform: 'translateY(-50%)',
          backgroundColor: '#ff0000',
          color: 'white',
          padding: '2px 6px',
          borderRadius: '3px',
          fontSize: '11px',
          fontWeight: 'bold',
          zIndex: 11,
        }}
      >
        {now.format('HH:mm')}
      </div>
    </>
  );
}
