import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Monitor, ExternalLink, Trash2, Link2 } from "lucide-react";
import PlatformIcon, { platformConfig } from "@/components/ui/PlatformIcon";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

export default function Platforms() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ platform: "twitch", username: "", profile_url: "", followers: 0 });

  // Placeholder: no GraphQL resolver for ConnectedPlatform yet
  const [platforms, setPlatforms] = useState([]);

  const handleSave = () => {
    const newPlatform = { ...form, id: Date.now().toString(), total_streams: 0 };
    setPlatforms(prev => [...prev, newPlatform]);
    setModalOpen(false);
    console.log("ConnectedPlatform.create stub:", form);
  };

  const handleDelete = (id) => {
    setPlatforms(prev => prev.filter(p => p.id !== id));
    console.log("ConnectedPlatform.delete stub:", id);
  };

  const gradients = {
    twitch: "from-[#9146FF]/20 to-[#9146FF]/5",
    youtube: "from-[#FF0000]/20 to-[#FF0000]/5",
    kick: "from-[#53FC18]/20 to-[#53FC18]/5",
    tiktok: "from-[#69C9D0]/20 to-[#69C9D0]/5",
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Platform Hub" description="Manage your connected platforms" actions={
        <Button onClick={() => { setForm({ platform: "twitch", username: "", profile_url: "", followers: 0 }); setModalOpen(true); }} className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white text-xs gap-1.5 h-8"><Plus size={14} />Connect Platform</Button>
      } />

      {platforms.length === 0 ? (
        <EmptyState icon={Monitor} title="No platforms connected" description="Connect your first streaming platform" actionLabel="Connect Platform" onAction={() => setModalOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {platforms.map(p => (
            <div key={p.id} className={`rounded-xl border border-[#2A2A4A] bg-gradient-to-br ${gradients[p.platform] || "from-[#6C63FF]/20 to-[#6C63FF]/5"} p-5 relative group`}>
              <button onClick={() => handleDelete(p.id)} className="absolute top-3 right-3 p-1 rounded text-[#6B6B80] hover:text-[#FF4757] opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 size={13} />
              </button>
              <div className="flex items-center gap-3 mb-4">
                <PlatformIcon platform={p.platform} size={24} />
                <div>
                  <p className="text-sm font-semibold text-white capitalize">{p.platform}</p>
                  <p className="text-xs text-[#A0A0B0]">@{p.username}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 mb-3">
                <span className="w-2 h-2 rounded-full bg-[#2ED573]" />
                <span className="text-xs text-[#2ED573]">Connected</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[#6B6B80]">Followers</span>
                  <span className="text-white font-medium">{(p.followers || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#6B6B80]">Total Streams</span>
                  <span className="text-white font-medium">{p.total_streams || 0}</span>
                </div>
              </div>
              {p.profile_url && (
                <a href={p.profile_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-3 text-[10px] text-[#6C63FF] hover:text-[#5B54E6]">
                  <ExternalLink size={10} />View Profile
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-[#1A1A2E] border-[#2A2A4A] text-white max-w-md">
          <DialogHeader><DialogTitle className="text-white">Connect Platform</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div><Label className="text-[#A0A0B0] text-xs">Platform</Label>
              <Select value={form.platform} onValueChange={v => setForm({...form, platform: v})}>
                <SelectTrigger className="bg-[#16213E] border-[#2A2A4A] text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#16213E] border-[#2A2A4A]">{["twitch","youtube","kick","tiktok"].map(p => <SelectItem key={p} value={p} className="text-white capitalize">{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-[#A0A0B0] text-xs">Username *</Label><Input value={form.username} onChange={e => setForm({...form, username: e.target.value})} placeholder="YourUsername" className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
            <div><Label className="text-[#A0A0B0] text-xs">Profile URL</Label><Input value={form.profile_url} onChange={e => setForm({...form, profile_url: e.target.value})} placeholder="https://..." className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
            <div><Label className="text-[#A0A0B0] text-xs">Followers</Label><Input type="number" value={form.followers} onChange={e => setForm({...form, followers: parseInt(e.target.value) || 0})} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)} className="border-[#2A2A4A] text-[#A0A0B0]">Cancel</Button>
              <Button onClick={handleSave} className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white gap-1.5"><Link2 size={14} />Connect</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
