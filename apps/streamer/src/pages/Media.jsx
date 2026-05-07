import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Grid3X3, List, FolderOpen, Upload, Trash2, FileImage, FileVideo, FileAudio, File, X } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

const assetTypes = ["overlay", "alert", "emote", "banner", "thumbnail", "vod", "clip", "sound_effect", "music", "graphic", "other"];
const typeIcons = { overlay: FileImage, alert: FileImage, emote: FileImage, banner: FileImage, thumbnail: FileImage, vod: FileVideo, clip: FileVideo, sound_effect: FileAudio, music: FileAudio, graphic: FileImage, other: File };

export default function Media() {
  const [view, setView] = useState("grid");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterFolder, setFilterFolder] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", type: "graphic", folder: "", tags: [], file_url: "", description: "" });
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);

  // Placeholder: no GraphQL resolver for MediaAsset yet
  const [assets, setAssets] = useState([]);

  const folders = [...new Set(assets.map(a => a.folder).filter(Boolean))];

  const handleSave = () => {
    const newAsset = { ...form, id: Date.now().toString(), created_date: new Date().toISOString() };
    setAssets(prev => [newAsset, ...prev]);
    setModalOpen(false);
    console.log("MediaAsset.create stub:", form);
  };

  const handleDelete = (id) => {
    setAssets(prev => prev.filter(a => a.id !== id));
    console.log("MediaAsset.delete stub:", id);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    // TODO: Wire up file upload when endpoint is ready
    console.log("UploadFile stub – file:", file.name);
    setForm(prev => ({ ...prev, file_url: URL.createObjectURL(file), title: prev.title || file.name }));
    setUploading(false);
  };

  const addTag = () => {
    if (tagInput.trim() && !form.tags.includes(tagInput.trim())) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, tagInput.trim()] }));
      setTagInput("");
    }
  };

  const filtered = assets.filter(a => {
    const matchSearch = !search || a.title?.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || a.type === filterType;
    const matchFolder = filterFolder === "all" || a.folder === filterFolder;
    return matchSearch && matchType && matchFolder;
  });

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Media Library" description="Manage your streaming assets" actions={
        <Button onClick={() => { setForm({ title: "", type: "graphic", folder: "", tags: [], file_url: "", description: "" }); setModalOpen(true); }} className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white text-xs gap-1.5 h-8"><Upload size={14} />Upload</Button>
      } />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B80]" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets..." className="bg-[#1A1A2E] border-[#2A2A4A] text-white pl-9 text-xs h-8" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-32 bg-[#1A1A2E] border-[#2A2A4A] text-white text-xs h-8"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[#16213E] border-[#2A2A4A]">
            <SelectItem value="all" className="text-white">All Types</SelectItem>
            {assetTypes.map(t => <SelectItem key={t} value={t} className="text-white">{t.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
        {folders.length > 0 && (
          <Select value={filterFolder} onValueChange={setFilterFolder}>
            <SelectTrigger className="w-32 bg-[#1A1A2E] border-[#2A2A4A] text-white text-xs h-8"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[#16213E] border-[#2A2A4A]">
              <SelectItem value="all" className="text-white">All Folders</SelectItem>
              {folders.map(f => <SelectItem key={f} value={f} className="text-white">{f}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="flex rounded-lg border border-[#2A2A4A] overflow-hidden ml-auto">
          <button onClick={() => setView("grid")} className={`px-3 py-1.5 text-xs ${view === "grid" ? "bg-[#6C63FF] text-white" : "text-[#6B6B80]"}`}><Grid3X3 size={14} /></button>
          <button onClick={() => setView("list")} className={`px-3 py-1.5 text-xs ${view === "list" ? "bg-[#6C63FF] text-white" : "text-[#6B6B80]"}`}><List size={14} /></button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No media assets" description="Upload your first asset" actionLabel="Upload" onAction={() => setModalOpen(true)} />
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(asset => {
            const Icon = typeIcons[asset.type] || File;
            return (
              <div key={asset.id} className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden hover:border-[#6C63FF]/30 transition-smooth group">
                <div className="aspect-video bg-[#16213E] flex items-center justify-center relative">
                  {asset.file_url && (asset.type === "thumbnail" || asset.type === "overlay" || asset.type === "emote" || asset.type === "banner" || asset.type === "graphic") ? (
                    <img src={asset.file_url} alt={asset.title} className="w-full h-full object-cover" />
                  ) : (
                    <Icon size={24} className="text-[#6B6B80]" />
                  )}
                  <button onClick={() => handleDelete(asset.id)} className="absolute top-2 right-2 p-1 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#FF4757]">
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="p-3">
                  <p className="text-xs font-medium text-white truncate">{asset.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#6C63FF]/10 text-[#6C63FF]">{asset.type?.replace(/_/g," ")}</span>
                    {asset.folder && <span className="text-[10px] text-[#6B6B80]">{asset.folder}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-[#2A2A4A]">
              <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Name</th>
              <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Type</th>
              <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Folder</th>
              <th className="text-right text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-[#2A2A4A]/50">
              {filtered.map(asset => (
                <tr key={asset.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-sm text-white">{asset.title}</td>
                  <td className="px-4 py-2.5 text-xs text-[#A0A0B0]">{asset.type?.replace(/_/g," ")}</td>
                  <td className="px-4 py-2.5 text-xs text-[#6B6B80]">{asset.folder || "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => handleDelete(asset.id)} className="p-1 text-[#6B6B80] hover:text-[#FF4757]"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-[#1A1A2E] border-[#2A2A4A] text-white max-w-lg">
          <DialogHeader><DialogTitle className="text-white">Upload Asset</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="border-2 border-dashed border-[#2A2A4A] rounded-xl p-6 text-center hover:border-[#6C63FF]/50 transition-smooth">
              {form.file_url ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-[#2ED573]">File uploaded</span>
                  <button onClick={() => setForm(prev => ({...prev, file_url: ""}))} className="text-[#6B6B80] hover:text-[#FF4757]"><X size={14} /></button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <Upload size={20} className="mx-auto text-[#6B6B80] mb-2" />
                  <p className="text-xs text-[#6B6B80]">{uploading ? "Uploading..." : "Click to upload"}</p>
                  <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>
              )}
            </div>
            <div><Label className="text-[#A0A0B0] text-xs">Title *</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[#A0A0B0] text-xs">Type</Label>
                <Select value={form.type} onValueChange={v => setForm({...form, type: v})}>
                  <SelectTrigger className="bg-[#16213E] border-[#2A2A4A] text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#16213E] border-[#2A2A4A]">{assetTypes.map(t => <SelectItem key={t} value={t} className="text-white">{t.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-[#A0A0B0] text-xs">Folder</Label><Input value={form.folder} onChange={e => setForm({...form, folder: e.target.value})} placeholder="e.g. Overlays" className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
            </div>
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
