import React from "react";

const statusStyles = {
  draft: "bg-[#6B6B80]/20 text-[#A0A0B0] border-[#6B6B80]/30",
  scheduled: "bg-[#6C63FF]/20 text-[#6C63FF] border-[#6C63FF]/30",
  live: "bg-[#FF4757]/20 text-[#FF4757] border-[#FF4757]/30 animate-pulse",
  completed: "bg-[#2ED573]/20 text-[#2ED573] border-[#2ED573]/30",
  cancelled: "bg-[#FFA502]/20 text-[#FFA502] border-[#FFA502]/30",
  proposed: "bg-[#FFA502]/20 text-[#FFA502] border-[#FFA502]/30",
  accepted: "bg-[#00D4AA]/20 text-[#00D4AA] border-[#00D4AA]/30",
  confirmed: "bg-[#6C63FF]/20 text-[#6C63FF] border-[#6C63FF]/30",
  declined: "bg-[#FF4757]/20 text-[#FF4757] border-[#FF4757]/30",
  ready: "bg-[#2ED573]/20 text-[#2ED573] border-[#2ED573]/30",
  needs_setup: "bg-[#FFA502]/20 text-[#FFA502] border-[#FFA502]/30",
  charging: "bg-[#00D4AA]/20 text-[#00D4AA] border-[#00D4AA]/30",
  broken: "bg-[#FF4757]/20 text-[#FF4757] border-[#FF4757]/30",
  in_repair: "bg-[#FFA502]/20 text-[#FFA502] border-[#FFA502]/30",
  retired: "bg-[#6B6B80]/20 text-[#A0A0B0] border-[#6B6B80]/30",
  raw: "bg-[#6B6B80]/20 text-[#A0A0B0] border-[#6B6B80]/30",
  edited: "bg-[#FFA502]/20 text-[#FFA502] border-[#FFA502]/30",
  published: "bg-[#2ED573]/20 text-[#2ED573] border-[#2ED573]/30",
  archived: "bg-[#6B6B80]/20 text-[#A0A0B0] border-[#6B6B80]/30",
};

export default function StatusBadge({ status, className = "" }) {
  const style = statusStyles[status] || statusStyles.draft;
  const label = status?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "Unknown";

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style} ${className}`}>
      {status === "live" && <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />}
      {label}
    </span>
  );
}