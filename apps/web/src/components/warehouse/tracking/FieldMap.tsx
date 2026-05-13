'use client';

import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Empty, Spin } from 'antd';
import dayjs from 'dayjs';

interface TrackerPosition {
  tagId: string;
  bleAddress?: string;
  equipmentId?: string;
  label?: string;
  battery?: number;
  kind: string;
  gatewayId: string;
  gatewayName?: string;
  lat?: number;
  lng?: number;
  rssi: number;
  confidence: number;
  computedAt: string;
}

interface FieldMapProps {
  positions: TrackerPosition[];
  selectedTagId: string | null;
  onTagSelect: (tagId: string) => void;
}

/**
 * Dynamically loads Leaflet (SSR-incompatible) and renders outdoor tracker positions
 * on OpenStreetMap tiles.
 */
const FieldMap: React.FC<FieldMapProps> = ({ positions, selectedTagId, onTagSelect }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [L, setL] = useState<any>(null);

  const validPositions = useMemo(
    () => positions.filter(p => p.lat != null && p.lng != null),
    [positions],
  );

  // Dynamically import Leaflet
  useEffect(() => {
    let cancelled = false;

    async function loadLeaflet() {
      const leaflet = await import('leaflet');
      await import('leaflet/dist/leaflet.css');

      // Fix default icon paths (common Next.js issue with Leaflet)
      delete (leaflet.Icon.Default.prototype as any)._getIconUrl;
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (!cancelled) {
        setL(leaflet);
        setLeafletLoaded(true);
      }
    }

    loadLeaflet();
    return () => { cancelled = true; };
  }, []);

  // Initialize map once
  useEffect(() => {
    if (!leafletLoaded || !L || !mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [32.0853, 34.7818], // Default: Tel Aviv
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [leafletLoaded, L]);

  // Update markers when positions change
  useEffect(() => {
    if (!mapInstanceRef.current || !L) return;
    const map = mapInstanceRef.current;
    const existingMarkers = markersRef.current;

    // Track which tags we've seen this render
    const seenTagIds = new Set<string>();

    for (const pos of validPositions) {
      seenTagIds.add(pos.tagId);
      const latlng = L.latLng(pos.lat!, pos.lng!);
      const seenAgo = dayjs().diff(dayjs(pos.computedAt), 'second');
      const isSelected = pos.tagId === selectedTagId;

      const popupContent = `
        <div style="direction:rtl; text-align:right; min-width:160px;">
          <strong>${pos.label || pos.bleAddress || 'ציוד'}</strong><br/>
          ${pos.gatewayName ? `<span style="color:#666;">גייטוויי: ${pos.gatewayName}</span><br/>` : ''}
          <span>עוצמת אות: ${pos.rssi} dBm</span><br/>
          ${pos.battery != null ? `<span>סוללה: ${pos.battery}%</span><br/>` : ''}
          <span style="color:#999;">לפני ${seenAgo < 60 ? `${seenAgo} שניות` : `${Math.floor(seenAgo / 60)} דקות`}</span>
        </div>
      `;

      const markerColor = isSelected ? '#1890ff' : (seenAgo < 60 ? '#52c41a' : seenAgo < 300 ? '#faad14' : '#ff4d4f');

      const icon = L.divIcon({
        className: 'tracker-field-marker',
        html: `
          <div style="
            width: 20px; height: 20px;
            background: ${markerColor};
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ${isSelected ? 'width: 26px; height: 26px; border: 3px solid #1890ff;' : ''}
          "></div>
        `,
        iconSize: [isSelected ? 26 : 20, isSelected ? 26 : 20],
        iconAnchor: [isSelected ? 13 : 10, isSelected ? 13 : 10],
      });

      if (existingMarkers.has(pos.tagId)) {
        const marker = existingMarkers.get(pos.tagId);
        marker.setLatLng(latlng);
        marker.setIcon(icon);
        marker.getPopup()?.setContent(popupContent);
      } else {
        const marker = L.marker(latlng, { icon })
          .addTo(map)
          .bindPopup(popupContent);
        marker.on('click', () => onTagSelect(pos.tagId));
        existingMarkers.set(pos.tagId, marker);
      }
    }

    // Remove markers no longer in positions
    for (const [tagId, marker] of existingMarkers) {
      if (!seenTagIds.has(tagId)) {
        map.removeLayer(marker);
        existingMarkers.delete(tagId);
      }
    }

    // Auto-fit bounds
    if (validPositions.length > 0) {
      const bounds = L.latLngBounds(validPositions.map((p: TrackerPosition) => [p.lat!, p.lng!]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [validPositions, selectedTagId, L]);

  // Pan to selected tag
  useEffect(() => {
    if (!selectedTagId || !mapInstanceRef.current) return;
    const marker = markersRef.current.get(selectedTagId);
    if (marker) {
      mapInstanceRef.current.setView(marker.getLatLng(), 15, { animate: true });
      marker.openPopup();
    }
  }, [selectedTagId]);

  if (!leafletLoaded) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100%', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (validPositions.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100%', minHeight: 400 }}>
        <Empty description="אין ציוד עם מיקום שטח כרגע" />
      </div>
    );
  }

  return (
    <div
      ref={mapContainerRef}
      style={{ width: '100%', height: '100%', minHeight: 400 }}
    />
  );
};

export default FieldMap;
