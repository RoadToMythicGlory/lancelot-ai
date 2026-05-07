import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { GET_REVENUE_ENTRIES } from "@/graphql/queries";
import { CREATE_REVENUE_ENTRY, DELETE_REVENUE_ENTRY } from "@/graphql/mutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Plus, DollarSign, TrendingUp, Trash2 } from "lucide-react";
import moment from "moment";
import StatCard from "@/components/ui/StatCard";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

const sources = ["twitch_subs", "twitch_bits", "youtube_superchat", "youtube_membership", "donations", "sponsorship", "merch", "ad_revenue", "other"];
const COLORS = ["#6C63FF", "#00D4AA", "#FF4757", "#FFA502", "#9146FF", "#69C9D0", "#2ED573", "#FF6B6B", "#A0A0B0"];

export default function Revenue() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ date: moment().format("YYYY-MM-DD"), source: "donations", amount: "", currency: "USD", platform: "twitch", notes: "" });

  const { data, refetch } = useQuery(GET_REVENUE_ENTRIES, { variables: { limit: 500 } });
  const entries = data?.revenueEntries || [];

  const [createEntry] = useMutation(CREATE_REVENUE_ENTRY, { onCompleted: () => { refetch(); setModalOpen(false); } });
  const [deleteEntry] = useMutation(DELETE_REVENUE_ENTRY, { onCompleted: () => refetch() });

  const thisMonth = entries.filter(e => moment(e.date).isSame(moment(), "month"));
  const lastMonth = entries.filter(e => moment(e.date).isSame(moment().subtract(1, "month"), "month"));
  const totalThisMonth = thisMonth.reduce((s, e) => s + (e.amount || 0), 0);
  const totalLastMonth = lastMonth.reduce((s, e) => s + (e.amount || 0), 0);
  const change = totalLastMonth > 0 ? (((totalThisMonth - totalLastMonth) / totalLastMonth) * 100).toFixed(0) : 0;

  const topSource = useMemo(() => {
    const sums = {};
    thisMonth.forEach(e => { sums[e.source] = (sums[e.source] || 0) + (e.amount || 0); });
    const sorted = Object.entries(sums).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0]?.replace(/_/g, " ") || "—";
  }, [thisMonth]);

  const avgPerStream = useMemo(() => {
    const streamCount = new Set(entries.filter(e => e.relatedStreamId).map(e => e.relatedStreamId)).size;
    const total = entries.reduce((s, e) => s + (e.amount || 0), 0);
    return streamCount > 0 ? (total / streamCount).toFixed(0) : 0;
  }, [entries]);

  // Revenue over time
  const overTimeData = useMemo(() => {
    const days = {};
    entries.forEach(e => {
      const day = moment(e.date).format("MMM D");
      days[day] = (days[day] || 0) + (e.amount || 0);
    });
    return Object.entries(days).slice(-30).map(([name, revenue]) => ({ name, revenue }));
  }, [entries]);

  // Revenue by source
  const bySourceData = useMemo(() => {
    const sums = {};
    entries.forEach(e => { sums[e.source?.replace(/_/g, " ") || "other"] = (sums[e.source?.replace(/_/g, " ") || "other"] || 0) + (e.amount || 0); });
    return Object.entries(sums).map(([name, value]) => ({ name, value }));
  }, [entries]);

  const tooltipStyle = { contentStyle: { background: "#1A1A2E", border: "1px solid #2A2A4A", borderRadius: "8px", color: "#fff", fontSize: "12px" } };

  const handleSave = () => {
    createEntry({ variables: { input: { ...form, amount: parseFloat(form.amount) || 0 } } });
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Revenue Tracker" description="Track your streaming income" actions={
        <Button onClick={() => { setForm({ date: moment().format("YYYY-MM-DD"), source: "donations", amount: "", currency: "USD", platform: "twitch", notes: "" }); setModalOpen(true); }} className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white text-xs gap-1.5 h-8"><Plus size={14} />Add Entry</Button>
      } />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard title="This Month" value={`$${totalThisMonth.toFixed(0)}`} icon={DollarSign} accentColor="#2ED573" />
        <StatCard title="vs Last Month" value={`${change >= 0 ? "+" : ""}${change}%`} icon={TrendingUp} accentColor={change >= 0 ? "#2ED573" : "#FF4757"} />
        <StatCard title="Top Source" value={topSource} icon={DollarSign} accentColor="#6C63FF" />
        <StatCard title="Avg per Stream" value={`$${avgPerStream}`} icon={DollarSign} accentColor="#FFA502" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Revenue Over Time</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={overTimeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A4A" />
              <XAxis dataKey="name" tick={{ fill: "#6B6B80", fontSize: 10 }} />
              <YAxis tick={{ fill: "#6B6B80", fontSize: 10 }} tickFormatter={v => `$${v}`} />
              <Tooltip {...tooltipStyle} formatter={v => [`$${v}`, "Revenue"]} />
              <Line type="monotone" dataKey="revenue" stroke="#2ED573" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Revenue by Source</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={bySourceData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {bySourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip {...tooltipStyle} formatter={v => [`$${v}`, "Amount"]} />
              <Legend wrapperStyle={{ fontSize: 10, color: "#6B6B80" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Revenue log */}
      <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2A2A4A]"><h3 className="text-sm font-semibold text-white">Revenue Log</h3></div>
        {entries.length === 0 ? (
          <EmptyState icon={DollarSign} title="No revenue entries" description="Start tracking your income" actionLabel="Add Entry" onAction={() => setModalOpen(true)} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-[#2A2A4A]">
                <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Date</th>
                <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Source</th>
                <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Platform</th>
                <th className="text-right text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Amount</th>
                <th className="text-right text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-[#2A2A4A]/50">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-xs text-[#A0A0B0]">{moment(e.date).format("MMM D, YYYY")}</td>
                    <td className="px-4 py-2.5 text-xs text-white">{e.source?.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2.5 text-xs text-[#A0A0B0] capitalize">{e.platform}</td>
                    <td className="px-4 py-2.5 text-sm text-[#2ED573] text-right font-mono">${(e.amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => deleteEntry({ variables: { id: e.id } })} className="p-1 text-[#6B6B80] hover:text-[#FF4757]"><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-[#1A1A2E] border-[#2A2A4A] text-white max-w-md">
          <DialogHeader><DialogTitle className="text-white">Add Revenue Entry</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[#A0A0B0] text-xs">Date</Label><Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
              <div><Label className="text-[#A0A0B0] text-xs">Amount ($)</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="0.00" className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[#A0A0B0] text-xs">Source</Label>
                <Select value={form.source} onValueChange={v => setForm({...form, source: v})}>
                  <SelectTrigger className="bg-[#16213E] border-[#2A2A4A] text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#16213E] border-[#2A2A4A]">{sources.map(s => <SelectItem key={s} value={s} className="text-white">{s.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-[#A0A0B0] text-xs">Platform</Label>
                <Select value={form.platform} onValueChange={v => setForm({...form, platform: v})}>
                  <SelectTrigger className="bg-[#16213E] border-[#2A2A4A] text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#16213E] border-[#2A2A4A]">{["twitch","youtube","kick","tiktok","other"].map(p => <SelectItem key={p} value={p} className="text-white capitalize">{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label className="text-[#A0A0B0] text-xs">Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)} className="border-[#2A2A4A] text-[#A0A0B0]">Cancel</Button>
              <Button onClick={handleSave} className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white">Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
