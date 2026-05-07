import React from "react";
import StatCard from "@/components/ui/StatCard";
import { Mic, Calendar, TrendingUp, Users } from "lucide-react";
import moment from "moment";

export default function PodcastMetrics({ episodes, guests }) {
  const now = moment();
  const startOfWeek = moment().startOf("isoWeek");

  const publishedCount = episodes.filter((e) => e.status === "published").length;

  const recordingThisWeek = episodes.filter(
    (e) =>
      e.scheduledRecordDate &&
      moment(e.scheduledRecordDate).isBetween(startOfWeek, now.clone().endOf("isoWeek"), null, "[]")
  ).length;

  const avgDownloads =
    publishedCount > 0
      ? Math.round(
          episodes
            .filter((e) => e.status === "published" && e.metrics?.downloads)
            .reduce((sum, e) => sum + (e.metrics.downloads || 0), 0) / publishedCount
        )
      : 0;

  const pendingGuests = guests.filter((g) => ["contacted", "confirmed"].includes(g.status)).length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard title="Total Episodes" value={publishedCount} icon={Mic} accentColor="#FFA502" />
      <StatCard title="Recording This Week" value={recordingThisWeek} icon={Calendar} accentColor="#1DB954" />
      <StatCard title="Avg Downloads" value={avgDownloads.toLocaleString()} icon={TrendingUp} accentColor="#872EC4" />
      <StatCard title="Pending Guests" value={pendingGuests} icon={Users} accentColor="#FC7E0F" />
    </div>
  );
}