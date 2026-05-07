import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, GripVertical } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import PlatformIcon from "@/components/ui/PlatformIcon";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

const statusColumns = ["proposed", "accepted", "confirmed", "completed"];
const collabTypes = ["guest_appearance", "co_stream", "raid_train", "tournament", "interview", "other"];

export default function Collaborations() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ title: "", collaborator_name: "", collaborator_platform: "twitch", collaborator_contact: "", scheduled_date: "", start_time: "", end_time: "", status: "proposed", type: "co_stream", notes: "" });

  // Placeholder: no GraphQL resolver for Collaboration yet
  const [collabs, setCollabs] = useState([]);

  const handleSave = () => {
    if (editItem) {
      setCollabs(prev => prev.map(c => c.id === editItem.id ? { ...c, ...form } : c));
      console.log("Collaboration.update stub:", editItem.id, form);
    } else {
      const newCollab = { ...form, id: Date.now().toString(), created_date: new Date().toISOString() };
      setCollabs(prev => [newCollab, ...prev]);
      console.log("Collaboration.create stub:", form);
    }
    setModalOpen(false);
    setEditItem(null);
  };

  const handleStatusUpdate = (id, status) => {
    setCollabs(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    console.log("Collaboration.update stub – status:", id, status);
  };

  const openNew = () => {
    setEditItem(null);
    setForm({ title: "", collaborator_name: "", collaborator_platform: "twitch", collaborator_contact: "", scheduled_date: "", start_time: "", end_time: "", status: "proposed", type: "co_stream", notes: "" });
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ title: item.title || "", collaborator_name: item.collaborator_name || "", collaborator_platform: item.collaborator_platform || "twitch", collaborator_contact: item.collaborator_contact || "", scheduled_date: item.scheduled_date || "", start_time: item.start_time || "", end_time: item.end_time || "", status: item.status || "proposed", type: item.type || "co_stream", notes: item.notes || "" });
    setModalOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Collaborations" description="Manage your creator collaborations" actions={
        <Button onClick={openNew} className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white text-xs gap-1.5 h-8"><Plus size={14} />New Collab</Button>
      } />

      {collabs.length === 0 ? (
        <EmptyState icon={Users} title="No collaborations yet" description="Start by proposing a collab" actionLabel="New Collab" onAction={openNew} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statusColumns.map(status => (
            <div key={status} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold text-[#6B6B80] uppercase tracking-wider">{status.replace(/_/g, " ")}</h3>
                <span className="text-[10px] text-[#6B6B80] bg-[#2A2A4A] px-1.5 py-0.5 rounded-full">
                  {collabs.filter(c => c.status === status).length}
                </span>
              </div>
              <div className="space-y-2 min-h-[100px]">
                {collabs.filter(c => c.status === status).map(collab => (
                  <div
                    key={collab.id}
                    onClick={() => openEdit(collab)}
                    className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] p-3.5 cursor-pointer hover:border-[#6C63FF]/30 transition-smooth group"
                  >
                    <div className="flex items-start justify-between">
                      <h4 className="text-sm font-medium text-white truncate pr-2">{collab.title}</h4>
                      <GripVertical size={12} className="text-[#6B6B80] opacity-0 group-hover:opacity-100 shrink-0" />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <PlatformIcon platform={collab.collaborator_platform} size={12} />
                      <span className="text-xs text-[#A0A0B0]">{collab.collaborator_name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#6C63FF]/10 text-[#6C63FF]">
                        {collab.type?.replace(/_/g, " ")}
                      </span>
                      {collab.scheduled_date && (
                        <span className="text-[10px] text-[#6B6B80]">{collab.scheduled_date}</span>
                      )}
                    </div>
                    {/* Quick status buttons */}
                    {status !== "completed" && (
                      <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {statusColumns.filter(s => s !== status).slice(0, 2).map(s => (
                          <button
                            key={s}
                            onClick={(e) => { e.stopPropagation(); handleStatusUpdate(collab.id, s); }}
                            className="text-[10px] px-2 py-0.5 rounded-full border border-[#2A2A4A] text-[#A0A0B0] hover:text-white hover:border-[#6C63FF] transition-smooth"
                          >
                            → {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={() => { setModalOpen(false); setEditItem(null); }}>
        <DialogContent className="bg-[#1A1A2E] border-[#2A2A4A] text-white max-w-lg">
          <DialogHeader><DialogTitle className="text-white">{editItem ? "Edit Collab" : "New Collaboration"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div><Label className="text-[#A0A0B0] text-xs">Title *</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Duo stream with @GamerX" className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[#A0A0B0] text-xs">Collaborator Name *</Label><Input value={form.collaborator_name} onChange={e => setForm({...form, collaborator_name: e.target.value})} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
              <div><Label className="text-[#A0A0B0] text-xs">Platform</Label>
                <Select value={form.collaborator_platform} onValueChange={v => setForm({...form, collaborator_platform: v})}>
                  <SelectTrigger className="bg-[#16213E] border-[#2A2A4A] text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#16213E] border-[#2A2A4A]">
                    {["twitch","youtube","kick","tiktok","other"].map(p => <SelectItem key={p} value={p} className="text-white capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label className="text-[#A0A0B0] text-xs">Type</Label>
              <Select value={form.type} onValueChange={v => setForm({...form, type: v})}>
                <SelectTrigger className="bg-[#16213E] border-[#2A2A4A] text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#16213E] border-[#2A2A4A]">{collabTypes.map(t => <SelectItem key={t} value={t} className="text-white">{t.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-[#A0A0B0] text-xs">Date</Label><Input type="date" value={form.scheduled_date} onChange={e => setForm({...form, scheduled_date: e.target.value})} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
              <div><Label className="text-[#A0A0B0] text-xs">Start</Label><Input type="time" value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
              <div><Label className="text-[#A0A0B0] text-xs">End</Label><Input type="time" value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
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
