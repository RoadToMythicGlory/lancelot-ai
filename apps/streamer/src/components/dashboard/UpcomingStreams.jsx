import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import moment from "moment";
import PlatformIcon from "@/components/ui/PlatformIcon";
import StatusBadge from "@/components/ui/StatusBadge";
import { Calendar, ArrowRight } from "lucide-react";

export default function UpcomingStreams({ streams }) {
  const upcoming = streams
    .filter(s => s.status === "scheduled" || s.status === "live")
    .sort((a, b) => moment(a.scheduledDate).diff(moment(b.scheduledDate)))
    .slice(0, 5);

  return (
    <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A4A]">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Calendar size={15} className="text-[#6C63FF]" />
          Upcoming Streams
        </h3>
        <Link to={createPageUrl("Streams")} className="text-xs text-[#6C63FF] hover:text-[#5B54E6] flex items-center gap-1">
          View All <ArrowRight size={12} />
        </Link>
      </div>
      <div className="divide-y divide-[#2A2A4A]/50">
        {upcoming.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6B6B80]">No upcoming streams</div>
        ) : (
          upcoming.map(stream => (
            <div key={stream.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-smooth">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{stream.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-[#6B6B80]">
                    {moment(stream.scheduledDate).format("MMM D")}
                    {stream.startTime && ` at ${stream.startTime}`}
                  </span>
                  <div className="flex gap-1">
                    {stream.platforms?.map(p => <PlatformIcon key={p} platform={p} size={12} />)}
                  </div>
                </div>
              </div>
              <StatusBadge status={stream.status} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}