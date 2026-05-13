'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Text, Group, Rect, Line } from 'react-konva';
import dayjs from 'dayjs';

interface TrackerPosition {
  tagId: string;
  bleAddress?: string;
  equipmentId?: string;
  label?: string;
  battery?: number;
  kind: string;
  siteId?: string;
  gatewayId: string;
  gatewayName?: string;
  zoneName?: string;
  x?: number;
  y?: number;
  rssi: number;
  confidence: number;
  computedAt: string;
}

interface GatewayItem {
  id: string;
  name: string;
  kind: string;
  position?: { x: number; y: number };
  zoneName?: string;
  online: boolean;
}

interface SiteData {
  id: string;
  name: string;
  floorPlanImageUrl?: string;
  widthMeters: number;
  heightMeters: number;
  gateways: GatewayItem[];
}

interface FloorPlanMapProps {
  site: SiteData;
  positions: TrackerPosition[];
  selectedTagId: string | null;
  onTagSelect: (tagId: string) => void;
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const TAG_RADIUS = 10;
const GATEWAY_SIZE = 14;

const FloorPlanMap: React.FC<FloorPlanMapProps> = ({
  site,
  positions,
  selectedTagId,
  onTagSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });

  // Observe container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height: Math.max(height, 400) });
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Load background image
  useEffect(() => {
    if (!site.floorPlanImageUrl) {
      setBgImage(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = site.floorPlanImageUrl;
    img.onload = () => setBgImage(img);
    img.onerror = () => setBgImage(null);
  }, [site.floorPlanImageUrl]);

  // Convert meters to canvas pixels
  const scaleX = containerSize.width / site.widthMeters;
  const scaleY = containerSize.height / site.heightMeters;
  const toCanvasX = useCallback((meters: number) => meters * scaleX, [scaleX]);
  const toCanvasY = useCallback((meters: number) => meters * scaleY, [scaleY]);

  // Resolve RSSI to color
  const rssiColor = useCallback((rssi: number) => {
    if (rssi > -50) return '#52c41a'; // strong = green
    if (rssi > -70) return '#faad14'; // medium = yellow
    return '#ff4d4f'; // weak = red
  }, []);

  // Pulsing animation state
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const interval = setInterval(() => setPulse(p => !p), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 400, position: 'relative' }}>
      <Stage width={containerSize.width} height={containerSize.height}>
        <Layer>
          {/* Background: floor plan image or grid */}
          {bgImage ? (
            <KonvaImage
              image={bgImage}
              width={containerSize.width}
              height={containerSize.height}
            />
          ) : (
            <>
              <Rect
                x={0} y={0}
                width={containerSize.width}
                height={containerSize.height}
                fill="#f5f5f5"
                stroke="#d9d9d9"
                strokeWidth={1}
              />
              {/* Grid lines */}
              {Array.from({ length: Math.ceil(site.widthMeters / 5) + 1 }).map((_, i) => (
                <Line
                  key={`vline-${i}`}
                  points={[toCanvasX(i * 5), 0, toCanvasX(i * 5), containerSize.height]}
                  stroke="#e8e8e8"
                  strokeWidth={1}
                />
              ))}
              {Array.from({ length: Math.ceil(site.heightMeters / 5) + 1 }).map((_, i) => (
                <Line
                  key={`hline-${i}`}
                  points={[0, toCanvasY(i * 5), containerSize.width, toCanvasY(i * 5)]}
                  stroke="#e8e8e8"
                  strokeWidth={1}
                />
              ))}
              <Text
                x={containerSize.width / 2 - 60}
                y={containerSize.height / 2 - 10}
                text={site.name}
                fontSize={16}
                fill="#bfbfbf"
                align="center"
              />
            </>
          )}

          {/* Gateway markers */}
          {site.gateways
            .filter(gw => gw.position)
            .map(gw => {
              const cx = toCanvasX(gw.position!.x);
              const cy = toCanvasY(gw.position!.y);
              return (
                <Group key={`gw-${gw.id}`}>
                  <Rect
                    x={cx - GATEWAY_SIZE / 2}
                    y={cy - GATEWAY_SIZE / 2}
                    width={GATEWAY_SIZE}
                    height={GATEWAY_SIZE}
                    fill={gw.online ? '#1890ff' : '#8c8c8c'}
                    cornerRadius={3}
                    stroke={gw.online ? '#096dd9' : '#595959'}
                    strokeWidth={1}
                  />
                  <Text
                    x={cx - 30}
                    y={cy + GATEWAY_SIZE / 2 + 2}
                    text={gw.zoneName || gw.name}
                    fontSize={9}
                    fill="#595959"
                    align="center"
                    width={60}
                  />
                </Group>
              );
            })}

          {/* Tag markers */}
          {positions.map(pos => {
            if (pos.x == null || pos.y == null) return null;
            const cx = toCanvasX(pos.x);
            const cy = toCanvasY(pos.y);
            const isSelected = selectedTagId === pos.tagId;
            const seenAgo = dayjs().diff(dayjs(pos.computedAt), 'second');
            const isRecent = seenAgo < 60;
            const color = rssiColor(pos.rssi);

            return (
              <Group
                key={`tag-${pos.tagId}`}
                onClick={() => onTagSelect(pos.tagId)}
                onTap={() => onTagSelect(pos.tagId)}
              >
                {/* Selection ring */}
                {isSelected && (
                  <Circle
                    x={cx}
                    y={cy}
                    radius={TAG_RADIUS + 6}
                    stroke="#1890ff"
                    strokeWidth={2}
                    dash={[4, 2]}
                  />
                )}
                {/* Pulse ring for recent readings */}
                {isRecent && (
                  <Circle
                    x={cx}
                    y={cy}
                    radius={TAG_RADIUS + (pulse ? 4 : 2)}
                    fill="transparent"
                    stroke={color}
                    strokeWidth={1}
                    opacity={pulse ? 0.3 : 0.6}
                  />
                )}
                {/* Tag dot */}
                <Circle
                  x={cx}
                  y={cy}
                  radius={TAG_RADIUS}
                  fill={color}
                  stroke={isSelected ? '#1890ff' : '#fff'}
                  strokeWidth={2}
                  shadowColor="rgba(0,0,0,0.2)"
                  shadowBlur={4}
                  shadowOffset={{ x: 1, y: 1 }}
                />
                {/* Label */}
                <Text
                  x={cx - 40}
                  y={cy + TAG_RADIUS + 3}
                  text={pos.label || pos.bleAddress || ''}
                  fontSize={10}
                  fill="#262626"
                  align="center"
                  width={80}
                  fontStyle={isSelected ? 'bold' : 'normal'}
                />
                {/* Battery indicator */}
                {pos.battery != null && pos.battery <= 20 && (
                  <Text
                    x={cx + TAG_RADIUS + 2}
                    y={cy - 5}
                    text="⚡"
                    fontSize={10}
                  />
                )}
              </Group>
            );
          })}

          {/* Scale legend */}
          <Group>
            <Line
              points={[10, containerSize.height - 20, 10 + scaleX * 10, containerSize.height - 20]}
              stroke="#8c8c8c"
              strokeWidth={2}
            />
            <Text
              x={10}
              y={containerSize.height - 35}
              text="10m"
              fontSize={10}
              fill="#8c8c8c"
            />
          </Group>
        </Layer>
      </Stage>
    </div>
  );
};

export default FloorPlanMap;
