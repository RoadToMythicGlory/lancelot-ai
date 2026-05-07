import React from "react";
import moment from "moment";
import { Calendar, Wrench, Users, Film, Zap } from "lucide-react";


const iconMap = {
  StreamEvent: Calendar,
  stream: Calendar,
  Equipment: Wrench,
  equipment: Wrench,
  Collaboration: Users,
  collab: Users,
  Clip: Film,
  clip: Film,
};

export default function ActivityFeed({ activities }) {
  return (
    <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#2A2A4A]">
        <Zap size={15} className="text-[#00D4AA]" />
        <h3 className="text-sm font-semibold text-white">Recent Activity</h3>
      </div>
      <div className="divide-y divide-[#2A2A4A]/50 max-h-[320px] overflow-y-auto">
        {activities.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6B6B80]">No recent activity</div>
        ) : (
          activities.map(activity => {
            const Icon = iconMap[activity.entity_type] || Zap;
            return (
              <div key={activity.id} className="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.02] transition-smooth">
                <div className="mt-0.5 p-1.5 rounded-md bg-[#6C63FF]/10">
                  <Icon size={12} className="text-[#6C63FF]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#A0A0B0]">{activity.action}</p>
                  <p className="text-[10px] text-[#6B6B80] mt-0.5">{moment(activity.createdAt).fromNow()}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}