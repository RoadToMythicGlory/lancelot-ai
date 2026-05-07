import React from "react";
import { Tv, Youtube, Gamepad2, Music2 } from "lucide-react";

const platformConfig = {
  twitch: { icon: Tv, color: "#9146FF", label: "Twitch" },
  youtube: { icon: Youtube, color: "#FF0000", label: "YouTube" },
  kick: { icon: Gamepad2, color: "#53FC18", label: "Kick" },
  tiktok: { icon: Music2, color: "#69C9D0", label: "TikTok" },
};

export default function PlatformIcon({ platform, size = 16, showLabel = false, className = "" }) {
  const config = platformConfig[platform];
  if (!config) return null;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Icon size={size} style={{ color: config.color }} />
      {showLabel && <span className="text-sm" style={{ color: config.color }}>{config.label}</span>}
    </span>
  );
}

export { platformConfig };