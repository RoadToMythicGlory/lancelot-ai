'use client';

import React from 'react';

interface Props {
  label: string;
  color: string;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
}

/**
 * Compact, accessible status chip used across the MCR page (preparation
 * status, output platform status, exchange status, etc.). Colors are
 * provided as hex by the caller so we can keep one shared visual treatment.
 */
const StatusChip: React.FC<Props> = ({ label, color, size = 'md', icon }) => {
  const fontSize = size === 'sm' ? 11 : 12.5;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        backgroundColor: `${color}1f`,
        color,
        border: `1px solid ${color}80`,
        padding: size === 'sm' ? '1px 8px' : '2px 10px',
        borderRadius: 999,
        fontWeight: 600,
        fontSize,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
      {icon}
      {label}
    </span>
  );
};

export default StatusChip;
