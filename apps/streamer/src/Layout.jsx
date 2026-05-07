import React, { useState } from "react";
import { useQuery } from "@apollo/client";
import { GET_STREAMER_ME, GET_NOTIFICATIONS } from "@/graphql/queries";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { createPageUrl } from "./utils";

const pageTitles = {
  Dashboard: "Dashboard",
  Streams: "Stream Calendar",
  Collaborations: "Collaborations",
  Equipment: "Equipment Manager",
  Media: "Media Library",
  Clips: "Clips & Highlights",
  Platforms: "Platform Hub",
  Analytics: "Analytics",
  Revenue: "Revenue Tracker",
  Team: "Team",
  AI: "AI Assistant",
  Notifications: "Notifications",
  Settings: "Settings",
  Episodes: "Podcast Episodes",
  Shows: "My Shows",
  Guests: "Guest Manager",
};

const noLayoutPages = ["Login", "Register", "AuthCallback"];

export default function Layout({ children, currentPageName }) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const { user: authUser, loading: authLoading } = useAuth();

  // No layout for auth pages
  if (noLayoutPages.includes(currentPageName)) {
    return <>{children}</>;
  }

  // Redirect to login if not authenticated
  if (!authLoading && !authUser) {
    navigate(createPageUrl("Login"));
    return null;
  }

  const user = authUser;

  const { data: notifData } = useQuery(GET_NOTIFICATIONS, {
    variables: { limit: 20, unreadOnly: true },
    skip: !authUser,
  });

  const unreadCount = notifData?.notifications?.unreadCount || 0;

  return (
    <div className="min-h-screen bg-[#0F0F0F]" data-theme="dark">
      <Sidebar
        currentPage={currentPageName}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        user={user}
        unreadCount={unreadCount}
      />
      <div className={`transition-all duration-300 ${collapsed ? 'ml-16' : 'ml-60'}`}>
        <TopBar
          title={pageTitles[currentPageName] || currentPageName}
          unreadCount={unreadCount}
          onNewStream={() => navigate(createPageUrl("Streams") + "?new=true")}
        />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}