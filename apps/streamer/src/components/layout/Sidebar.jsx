import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  LayoutDashboard, Calendar, Users, Wrench, FolderOpen, Film,
  Monitor, BarChart3, DollarSign, UserCog, Bot, Bell, Settings,
  ChevronLeft, ChevronRight, Swords, Radio, Mic
} from "lucide-react";

const navItems = [
  { section: "Streaming" },
  { name: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
  { name: "Stream Calendar", icon: Calendar, page: "Streams" },
  { name: "Collaborations", icon: Users, page: "Collaborations" },
  { name: "Equipment", icon: Wrench, page: "Equipment" },
  { name: "Media Library", icon: FolderOpen, page: "Media" },
  { name: "Clips & Highlights", icon: Film, page: "Clips" },
  { name: "Platform Hub", icon: Monitor, page: "Platforms" },
  { section: "Podcast" },
  { name: "Episodes", icon: Mic, page: "Episodes" },
  { name: "Shows", icon: Radio, page: "Shows" },
  { name: "Guest Manager", icon: Users, page: "Guests" },
  { section: "Business" },
  { name: "Analytics", icon: BarChart3, page: "Analytics" },
  { name: "Revenue", icon: DollarSign, page: "Revenue" },
  { section: "System" },
  { name: "Team", icon: UserCog, page: "Team" },
  { name: "AI Assistant", icon: Bot, page: "AI" },
  { name: "Notifications", icon: Bell, page: "Notifications" },
  { name: "Settings", icon: Settings, page: "Settings" },
];

export default function Sidebar({ currentPage, collapsed, onToggle, user, unreadCount }) {
  return (
    <aside className={`fixed top-0 left-0 h-full z-40 flex flex-col bg-[#1A1A2E] border-r border-[#2A2A4A] transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'}`}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-[#2A2A4A] shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[#6C63FF] flex items-center justify-center shrink-0">
          <Swords size={16} className="text-white" />
        </div>
        {!collapsed && <span className="font-bold text-white text-sm tracking-tight">Lancelot Streamer</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item, idx) => {
          if (item.section) {
            return !collapsed ? (
              <div key={idx} className="px-3 py-2 text-[10px] font-semibold text-[#6B6B80] uppercase tracking-wider mt-4 first:mt-0">
                {item.section}
              </div>
            ) : null;
          }
          const isActive = currentPage === item.page;
          const Icon = item.icon;
          return (
            <Link
              key={item.page}
              to={createPageUrl(item.page)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-smooth relative group
                ${isActive
                  ? 'bg-[#6C63FF]/15 text-[#6C63FF]'
                  : 'text-[#A0A0B0] hover:text-white hover:bg-white/5'
                }
              `}
            >
              {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#6C63FF] rounded-r-full" />}
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.name}</span>}
              {item.page === "Notifications" && unreadCount > 0 && (
                <span className={`${collapsed ? 'absolute top-0.5 right-0.5' : 'ml-auto'} flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[#FF4757] text-white text-[10px] font-bold px-1`}>
                  {unreadCount}
                </span>
              )}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 rounded-md bg-[#16213E] border border-[#2A2A4A] text-white text-xs whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User + Collapse */}
      <div className="border-t border-[#2A2A4A] p-3 space-y-2">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-1.5 rounded-lg text-[#6B6B80] hover:text-white hover:bg-white/5 transition-smooth"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        {user && (
          <Link
            to={createPageUrl("Settings")}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-smooth"
          >
            <div className="w-7 h-7 rounded-full bg-[#6C63FF] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user.full_name?.[0]?.toUpperCase() || "U"}
            </div>
            {!collapsed && (
              <div className="overflow-hidden">
                <p className="text-xs font-medium text-white truncate">{user.full_name || "User"}</p>
                <p className="text-[10px] text-[#6B6B80] truncate">{user.email}</p>
              </div>
            )}
          </Link>
        )}
      </div>
    </aside>
  );
}