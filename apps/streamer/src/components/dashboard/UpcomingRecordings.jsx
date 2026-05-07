import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import moment from "moment";
import { Mic, ArrowRight, Users } from "lucide-react";

export default function UpcomingRecordings({ episodes }) {
  const upcoming = episodes
    .filter((e) => ["scheduled", "recording"].includes(e.status))
    .sort((a, b) => moment(a.scheduledRecordDate).diff(moment(b.scheduledRecordDate)))
    .slice(0, 5);

  return (
    <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A4A]">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Mic size={15} className="text-[#FFA502]" />
          Upcoming Recordings
        </h3>
        <Link to={createPageUrl("Episodes")} className="text-xs text-[#FFA502] hover:text-[#E69500] flex items-center gap-1">
          View All <ArrowRight size={12} />
        </Link>
      </div>
      <div className="divide-y divide-[#2A2A4A]/50">
        {upcoming.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6B6B80]">No upcoming recordings</div>
        ) : (
          upcoming.map((episode) => (
            <div key={episode.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-smooth">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{episode.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-[#6B6B80]">
                    {moment(episode.scheduledRecordDate).format("MMM D")}
                    {episode.recordStartTime && ` at ${episode.recordStartTime}`}
                  </span>
                  {episode.showName && (
                    <span className="text-xs text-[#FFA502]">• {episode.showName}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {episode.guests?.length > 0 && (
                  <div className="flex items-center gap-1 text-[#6B6B80]">
                    <Users size={12} />
                    <span className="text-xs">{episode.guests.length}</span>
                  </div>
                )}
                {episode.format && (
                  <span className="px-2 py-0.5 bg-[#2A2A4A] rounded text-xs text-[#A0A0B0]">
                    {episode.format}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}