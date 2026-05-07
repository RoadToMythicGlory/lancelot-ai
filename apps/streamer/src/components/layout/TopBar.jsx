import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Search, Bell, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TopBar({ title, unreadCount, onNewStream }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-6 bg-[#0F0F0F]/80 backdrop-blur-xl border-b border-[#2A2A4A]/50">
      <h2 className="text-lg font-semibold text-white">{title}</h2>

      <div className="flex items-center gap-2">
        {/* Search */}
        <div className={`flex items-center transition-all duration-300 ${searchOpen ? 'w-64' : 'w-auto'}`}>
          {searchOpen ? (
            <div className="flex items-center w-full bg-[#1A1A2E] border border-[#2A2A4A] rounded-lg px-3 py-1.5">
              <Search size={14} className="text-[#6B6B80] shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="ml-2 bg-transparent text-sm text-white placeholder-[#6B6B80] outline-none w-full"
              />
              <button onClick={() => { setSearchOpen(false); setSearchQuery(""); }}>
                <X size={14} className="text-[#6B6B80]" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[#6B6B80] hover:text-white hover:bg-white/5 transition-smooth text-xs"
            >
              <Search size={14} />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden sm:inline px-1.5 py-0.5 rounded bg-[#2A2A4A] text-[10px] font-mono">⌘K</kbd>
            </button>
          )}
        </div>

        {/* Notifications */}
        <Link
          to={createPageUrl("Notifications")}
          className="relative p-2 rounded-lg text-[#6B6B80] hover:text-white hover:bg-white/5 transition-smooth"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#FF4757]" />
          )}
        </Link>

        {/* New Stream */}
        <Button
          onClick={onNewStream}
          size="sm"
          className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white text-xs gap-1.5 h-8"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">New Stream</span>
        </Button>
      </div>
    </header>
  );
}