import React from "react";

export default function StatCard({ title, value, subtitle, icon: Icon, accentColor = "#6C63FF", className = "" }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] p-5 transition-smooth glow-primary-hover ${className}`}>
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-10" style={{ background: accentColor }} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-[#6B6B80] uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold mt-1 text-white">{value}</p>
          {subtitle && <p className="text-xs text-[#A0A0B0] mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="p-2.5 rounded-lg" style={{ backgroundColor: `${accentColor}20` }}>
            <Icon size={18} style={{ color: accentColor }} />
          </div>
        )}
      </div>
    </div>
  );
}