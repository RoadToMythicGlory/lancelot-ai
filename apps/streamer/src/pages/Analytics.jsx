import React, { useState, useMemo } from "react";
import { useQuery } from "@apollo/client";
import { GET_STREAM_EVENTS } from "@/graphql/queries";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import moment from "moment";
import StatCard from "@/components/ui/StatCard";
import PageHeader from "@/components/ui/PageHeader";
import { BarChart3, Clock, Users, TrendingUp, UserPlus, DollarSign } from "lucide-react";

const COLORS = ["#6C63FF", "#00D4AA", "#FF4757", "#FFA502", "#9146FF", "#69C9D0"];

const ranges = [
  { label: "7 Days", days: 7 },
  { label: "30 Days", days: 30 },
  { label: "90 Days", days: 90 },
  { label: "This Year", days: 365 },
];

export default function Analytics() {
  const [range, setRange] = useState(30);

  const { data } = useQuery(GET_STREAM_EVENTS, { variables: { limit: 500 } });
  const streams = data?.streamerEvents || [];

  const cutoff = moment().subtract(range, "days");
  const filtered = streams.filter(s => moment(s.scheduledDate).isAfter(cutoff) && s.status === "completed");

  const totalStreams = filtered.length;
  const totalHours = filtered.reduce((sum, s) => {
    if (s.startTime && s.endTime) {
      return sum + moment(s.endTime, "HH:mm").diff(moment(s.startTime, "HH:mm"), "hours", true);
    }
    return sum + 2;
  }, 0);
  const avgViewers = totalStreams > 0 ? Math.round(filtered.reduce((s, st) => s + (st.metrics?.avgViewers || 0), 0) / totalStreams) : 0;
  const peakViewers = Math.max(0, ...filtered.map(s => s.metrics?.peakViewers || 0));
  const totalFollowers = filtered.reduce((s, st) => s + (st.metrics?.newFollowers || 0), 0);
  const totalRevenue = filtered.reduce((s, st) => s + (st.metrics?.revenue || 0), 0);

  // Streams per week data
  const weeklyData = useMemo(() => {
    const weeks = {};
    filtered.forEach(s => {
      const week = moment(s.scheduledDate).startOf("isoWeek").format("MMM D");
      weeks[week] = (weeks[week] || 0) + 1;
    });
    return Object.entries(weeks).map(([name, count]) => ({ name, streams: count }));
  }, [filtered]);

  // Platform breakdown
  const platformData = useMemo(() => {
    const counts = {};
    filtered.forEach(s => {
      (s.platforms || []).forEach(p => {
        counts[p] = (counts[p] || 0) + 1;
      });
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // Viewer trend
  const viewerTrend = useMemo(() => {
    return filtered
      .sort((a, b) => moment(a.scheduledDate).diff(moment(b.scheduledDate)))
      .map(s => ({
        name: moment(s.scheduledDate).format("MMM D"),
        avg: s.metrics?.avgViewers || 0,
        peak: s.metrics?.peakViewers || 0,
      }));
  }, [filtered]);

  const tooltipStyle = { contentStyle: { background: "#1A1A2E", border: "1px solid #2A2A4A", borderRadius: "8px", color: "#fff", fontSize: "12px" } };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Analytics" description="Your streaming performance" actions={
        <div className="flex rounded-lg border border-[#2A2A4A] overflow-hidden">
          {ranges.map(r => (
            <button key={r.days} onClick={() => setRange(r.days)} className={`px-3 py-1.5 text-xs font-medium transition-smooth ${range === r.days ? "bg-[#6C63FF] text-white" : "text-[#6B6B80] hover:text-white"}`}>
              {r.label}
            </button>
          ))}
        </div>
      } />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard title="Total Streams" value={totalStreams} icon={BarChart3} accentColor="#6C63FF" />
        <StatCard title="Hours Streamed" value={totalHours.toFixed(1)} icon={Clock} accentColor="#00D4AA" />
        <StatCard title="Avg Viewers" value={avgViewers} icon={Users} accentColor="#FFA502" />
        <StatCard title="Peak Viewers" value={peakViewers} icon={TrendingUp} accentColor="#FF4757" />
        <StatCard title="New Followers" value={totalFollowers} icon={UserPlus} accentColor="#9146FF" />
        <StatCard title="Revenue" value={`$${totalRevenue.toFixed(0)}`} icon={DollarSign} accentColor="#2ED573" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Streams per week */}
        <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Streams per Week</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A4A" />
              <XAxis dataKey="name" tick={{ fill: "#6B6B80", fontSize: 10 }} />
              <YAxis tick={{ fill: "#6B6B80", fontSize: 10 }} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="streams" fill="#6C63FF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Viewer trend */}
        <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Viewer Count Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={viewerTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A4A" />
              <XAxis dataKey="name" tick={{ fill: "#6B6B80", fontSize: 10 }} />
              <YAxis tick={{ fill: "#6B6B80", fontSize: 10 }} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10, color: "#6B6B80" }} />
              <Line type="monotone" dataKey="avg" stroke="#00D4AA" strokeWidth={2} dot={false} name="Avg Viewers" />
              <Line type="monotone" dataKey="peak" stroke="#FF4757" strokeWidth={2} dot={false} name="Peak Viewers" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Platform breakdown */}
        <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Platform Breakdown</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={platformData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {platformData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10, color: "#6B6B80" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stream performance table */}
      <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2A2A4A]">
          <h3 className="text-sm font-semibold text-white">Stream Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-[#2A2A4A]">
              <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Date</th>
              <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Title</th>
              <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Duration</th>
              <th className="text-right text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Peak</th>
              <th className="text-right text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Avg</th>
              <th className="text-right text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Followers</th>
              <th className="text-right text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Revenue</th>
            </tr></thead>
            <tbody className="divide-y divide-[#2A2A4A]/50">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[#6B6B80]">No completed streams in this period</td></tr>
              ) : (
                filtered.map(s => (
                  <tr key={s.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-xs text-[#A0A0B0]">{moment(s.scheduledDate).format("MMM D")}</td>
                    <td className="px-4 py-2.5 text-sm text-white">{s.title}</td>
                    <td className="px-4 py-2.5 text-xs text-[#A0A0B0] font-mono">{s.startTime && s.endTime ? `${s.startTime}-${s.endTime}` : "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-white text-right font-mono">{s.metrics?.peakViewers || 0}</td>
                    <td className="px-4 py-2.5 text-xs text-white text-right font-mono">{s.metrics?.avgViewers || 0}</td>
                    <td className="px-4 py-2.5 text-xs text-[#2ED573] text-right font-mono">+{s.metrics?.newFollowers || 0}</td>
                    <td className="px-4 py-2.5 text-xs text-white text-right font-mono">${(s.metrics?.revenue || 0).toFixed(0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
