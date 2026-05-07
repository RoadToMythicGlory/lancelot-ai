import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Calendar, Wrench, Users, Upload, BarChart3, Bot, Mic, UserPlus } from "lucide-react";

const actions = [
  { label: "Schedule a Stream", icon: Calendar, page: "Streams", query: "?new=true", color: "#6C63FF" },
  { label: "New Episode", icon: Mic, page: "Episodes", query: "?new=true", color: "#FFA502" },
  { label: "Check Equipment", icon: Wrench, page: "Equipment", color: "#00D4AA" },
  { label: "Add Guest", icon: UserPlus, page: "Guests", query: "?new=true", color: "#FC7E0F" },
  { label: "Find Collaborators", icon: Users, page: "Collaborations", color: "#872EC4" },
  { label: "Upload Media", icon: Upload, page: "Media", color: "#FF4757" },
  { label: "View Analytics", icon: BarChart3, page: "Analytics", color: "#9146FF" },
  { label: "AI Assistant", icon: Bot, page: "AI", color: "#69C9D0" },
];

export default function QuickActions() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {actions.map(action => {
        const Icon = action.icon;
        return (
          <Link
            key={action.label}
            to={createPageUrl(action.page) + (action.query || "")}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] hover:border-[#6C63FF]/30 hover:bg-[#6C63FF]/5 transition-smooth group"
          >
            <div className="p-2.5 rounded-lg transition-smooth" style={{ backgroundColor: `${action.color}15` }}>
              <Icon size={18} style={{ color: action.color }} className="group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-xs font-medium text-[#A0A0B0] group-hover:text-white text-center transition-smooth">
              {action.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}