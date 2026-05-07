import React, { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { GET_CLIPS } from "@/graphql/queries";
import { CREATE_CLIP, UPDATE_CLIP, DELETE_CLIP } from "@/graphql/mutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Grid3X3, List, Film, Play, Trash2, X } from "lucide-react";
import PlatformIcon from "@/components/ui/PlatformIcon";
import StatusBadge from "@/components/ui/StatusBadge";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

const clipStatuses = ["raw", "edited", "published", "archived"];

export default function Clips() {
  const [view, setView] = useState("grid");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", platform: "twitch", clip_url: "", thumbnail_url: "", duration: "", status: "raw", tags: [] });
  const [tagInput, setTagInput] = useState("");

  const { data, refetch } = useQuery(GET_CLIPS, { variables: { limit: 100 } });
  const clips = data?.streamerClips || [];

  const [createClip] = useMutation(CREATE_CLIP, { onCompleted: () => { refetch(); setModalOpen(false); } });
  const [updateClip] = useMutation(UPDATE_CLIP, { onCompleted: () => refetch() });
  const [deleteClip] = useMutation(DELETE_CLIP, { onCompleted: () => refetch() });

  const addTag = () => {
    if (tagInput.trim() && !form.tags.includes(tagInput.trim())) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, tagInput.trim()] }));
      setTagInput("");
    }
  };

  const filtered = clips.filter(c => {
    const matchSearch = !search || c.title?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleSave = () => {
    const input = {
      title: form.title,
      platform: form.platform,
      clipUrl: form.clip_url || undefined,
      thumbnailUrl: form.thumbnail_url || undefined,
      duration: form.duration ? parseInt(form.duration, 10) : undefined,
      tags: form.tags,
    };
    createClip({ variables: { input } });
  };

  const handleUpdateStatus = (id, status) => {
    const nextStatus = status === "raw" ? "edited" : "published";
    updateClip({ variables: { id, input: { status: nextStatus } } });
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Clips & Highlights" description="Manage your stream clips" actions={
        <Button onClick={() => { setForm({ title: "", platform: "twitch", clip_url: "", thumbnail_url: "", duration: "", status: "raw", tags: [] }); setModalOpen(true); }} className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white text-xs gap-1.5 h-8"><Plus size={14} />Add Clip</Button>
      } />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B80]" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clips..." className="bg-[#1A1A2E] border-[#2A2A4A] text-white pl-9 text-xs h-8" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-28 bg-[#1A1A2E] border-[#2A2A4A] text-white text-xs h-8"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[#16213E] border-[#2A2A4A]">
            <SelectItem value="all" className="text-white">All Status</SelectItem>
            {clipStatuses.map(s => <SelectItem key={s} value={s} className="text-white capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex rounded-lg border border-[#2A2A4A] overflow-hidden ml-auto">
          <button onClick={() => setView("grid")} className={`px-3 py-1.5 text-xs ${view === "grid" ? "bg-[#6C63FF] text-white" : "text-[#6B6B80]"}`}><Grid3X3 size={14} /></button>
          <button onClick={() => setView("list")} className={`px-3 py-1.5 text-xs ${view === "list" ? "bg-[#6C63FF] text-white" : "text-[#6B6B80]"}`}><List size={14} /></button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Film} title="No clips yet" description="Add your first clip" actionLabel="Add Clip" onAction={() => setModalOpen(true)} />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(clip => (
            <div key={clip.id} className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden hover:border-[#6C63FF]/30 transition-smooth group">
              <div className="aspect-video bg-[#16213E] flex items-center justify-center relative">
                {clip.thumbnailUrl ? (
                  <img src={clip.thumbnailUrl} alt={clip.title} className="w-full h-full object-cover" />
                ) : (
                  <Play size={24} className="text-[#6B6B80]" />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {clip.clipUrl && <a href={clip.clipUrl} target="_blank" rel="noopener noreferrer" className="p-3 rounded-full bg-white/20 backdrop-blur text-white"><Play size={20} /></a>}
                </div>
                {clip.duration && <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-mono">{clip.duration}s</span>}
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between">
                  <p className="text-xs font-medium text-white truncate pr-2">{clip.title}</p>
                  <PlatformIcon platform={clip.platform} size={12} />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <StatusBadge status={clip.status} />
                  <div className="flex gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                    {clip.status !== "published" && <button onClick={() => handleUpdateStatus(clip.id, clip.status)} className="text-[10px] px-1.5 py-0.5 rounded border border-[#2A2A4A] text-[#A0A0B0] hover:text-white">→</button>}
                    <button onClick={() => deleteClip({ variables: { id: clip.id } })} className="p-0.5 text-[#6B6B80] hover:text-[#FF4757]"><Trash2 size={11} /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-[#2A2A4A]">
              <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Title</th>
              <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Platform</th>
              <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Status</th>
              <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Duration</th>
              <th className="text-right text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-[#2A2A4A]/50">
              {filtered.map(clip => (
                <tr key={clip.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-sm text-white">{clip.title}</td>
                  <td className="px-4 py-2.5"><PlatformIcon platform={clip.platform} size={14} showLabel /></td>
                  <td className="px-4 py-2.5"><StatusBadge status={clip.status} /></td>
                  <td className="px-4 py-2.5 text-xs text-[#A0A0B0] font-mono">{clip.duration ? `${clip.duration}s` : "—"}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => deleteClip({ variables: { id: clip.id } })} className="p-1 text-[#6B6B80] hover:text-[#FF4757]"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-[#1A1A2E] border-[#2A2A4A] text-white max-w-lg">
          <DialogHeader><DialogTitle className="text-white">Add Clip</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div><Label className="text-[#A0A0B0] text-xs">Title *</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Epic Clutch" className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[#A0A0B0] text-xs">Platform</Label>
                <Select value={form.platform} onValueChange={v => setForm({...form, platform: v})}>
                  <SelectTrigger className="bg-[#16213E] border-[#2A2A4A] text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#16213E] border-[#2A2A4A]">{["twitch","youtube","kick","tiktok"].map(p => <SelectItem key={p} value={p} className="text-white capitalize">{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-[#A0A0B0] text-xs">Duration (seconds)</Label><Input type="number" value={form.duration} onChange={e => setForm({...form, duration: parseInt(e.target.value) || ""})} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
            </div>
            <div><Label className="text-[#A0A0B0] text-xs">Clip URL</Label><Input value={form.clip_url} onChange={e => setForm({...form, clip_url: e.target.value})} placeholder="https://..." className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
            <div>
              <Label className="text-[#A0A0B0] text-xs">Tags</Label>
              <div className="flex gap-2 mt-1">
                <Input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())} placeholder="Add tag..." className="bg-[#16213E] border-[#2A2A4A] text-white" />
                <Button onClick={addTag} variant="outline" className="border-[#2A2A4A] text-white hover:bg-white/5">Add</Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#6C63FF]/15 text-[#6C63FF] text-xs">
                      {tag}<button onClick={() => setForm(prev => ({...prev, tags: prev.tags.filter(t => t !== tag)}))}><X size={10} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
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
