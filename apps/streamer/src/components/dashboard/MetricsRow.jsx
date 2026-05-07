import React from "react";
import StatCard from "@/components/ui/StatCard";
import { Calendar, Clock, Radio, Users } from "lucide-react";
import moment from "moment";

export default function MetricsRow({ streams, collabs }) {
  const now = moment();
  const startOfWeek = moment().startOf("isoWeek");
  const startOfMonth = moment().startOf("month");

  const streamsThisWeek = streams.filter(s =>
    moment(s.scheduledDate).isBetween(startOfWeek, now, null, "[]") && s.status !== "cancelled"
  ).length;

  const hoursThisMonth = streams
    .filter(s => moment(s.scheduledDate).isBetween(startOfMonth, now, null, "[]") && s.status === "completed")
    .reduce((sum, s) => {
      if (s.startTime && s.endTime) {
        const start = moment(s.startTime, "HH:mm");
        const end = moment(s.endTime, "HH:mm");
        return sum + end.diff(start, "hours", true);
      }
      return sum + 2;
    }, 0);

  const nextStream = streams
    .filter(s => s.status === "scheduled" && moment(s.scheduledDate).isAfter(now))
    .sort((a, b) => moment(a.scheduledDate).diff(moment(b.scheduledDate)))[0];

  const nextStreamText = nextStream
    ? moment(nextStream.scheduledDate).fromNow()
    : "None scheduled";

  const activeCollabs = Array.isArray(collabs)
    ? collabs.filter(c => ["proposed", "accepted", "confirmed"].includes(c.status)).length
    : (typeof collabs?.length === "number" ? collabs.length : 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard title="Streams This Week" value={streamsThisWeek} icon={Calendar} accentColor="#6C63FF" />
      <StatCard title="Hours This Month" value={hoursThisMonth.toFixed(1)} icon={Clock} accentColor="#00D4AA" />
      <StatCard title="Next Stream" value={nextStreamText} subtitle={nextStream?.title} icon={Radio} accentColor="#FF4757" />
      <StatCard title="Active Collabs" value={activeCollabs} icon={Users} accentColor="#FFA502" />
    </div>
  );
}