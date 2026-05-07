import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PlatformIcon from "@/components/ui/PlatformIcon";
import { X, Save, FileText } from "lucide-react";

const platformOptions = ["twitch", "youtube", "kick", "tiktok"];
const streamTypes = ["solo", "collab", "subathon", "special_event", "restream"];

export default function StreamFormModal({ open, onClose, onSave, stream, equipment }) {
  const [form, setForm] = useState({
    title: "", description: "", platforms: [], scheduled_date: "",
    start_time: "", end_time: "", category: "", tags: [],
    status: "draft", stream_type: "solo", go_live_reminder: 30,
    equipment_ids: [], notes: "", thumbnail_url: "",
  });
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (stream) {
      setForm({ ...form, ...stream });
    } else {
      setForm({
        title: "", description: "", platforms: [], scheduled_date: "",
        start_time: "", end_time: "", category: "", tags: [],
        status: "draft", stream_type: "solo", go_live_reminder: 30,
        equipment_ids: [], notes: "", thumbnail_url: "",
      });
    }
  }, [stream, open]);

  const togglePlatform = (p) => {
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(p)
        ? prev.platforms.filter(x => x !== p)
        : [...prev.platforms, p]
    }));
  };

  const addTag = () => {
    if (tagInput.trim() && !form.tags.includes(tagInput.trim())) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, tagInput.trim()] }));
      setTagInput("");
    }
  };

  const toggleEquipment = (id) => {
    setForm(prev => ({
      ...prev,
      equipment_ids: prev.equipment_ids?.includes(id)
        ? prev.equipment_ids.filter(x => x !== id)
        : [...(prev.equipment_ids || []), id]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1A1A2E] border-[#2A2A4A] text-white max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">{stream ? "Edit Stream" : "New Stream"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Title */}
          <div>
            <Label className="text-[#A0A0B0] text-xs">Title *</Label>
            <Input
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Friday Night Gaming"
              className="bg-[#16213E] border-[#2A2A4A] text-white mt-1"
            />
          </div>

          {/* Platforms */}
          <div>
            <Label className="text-[#A0A0B0] text-xs">Platforms</Label>
            <div className="flex gap-2 mt-1">
              {platformOptions.map(p => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-smooth ${
                    form.platforms.includes(p)
                      ? 'border-[#6C63FF] bg-[#6C63FF]/10'
                      : 'border-[#2A2A4A] bg-[#16213E] hover:border-[#6B6B80]'
                  }`}
                >
                  <PlatformIcon platform={p} size={14} />
                  <span className="capitalize text-white">{p}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date / Time */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[#A0A0B0] text-xs">Date</Label>
              <Input type="date" value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" />
            </div>
            <div>
              <Label className="text-[#A0A0B0] text-xs">Start Time</Label>
              <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" />
            </div>
            <div>
              <Label className="text-[#A0A0B0] text-xs">End Time</Label>
              <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" />
            </div>
          </div>

          {/* Category & Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[#A0A0B0] text-xs">Category / Game</Label>
              <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Valorant" className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" />
            </div>
            <div>
              <Label className="text-[#A0A0B0] text-xs">Stream Type</Label>
              <Select value={form.stream_type} onValueChange={v => setForm({ ...form, stream_type: v })}>
                <SelectTrigger className="bg-[#16213E] border-[#2A2A4A] text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#16213E] border-[#2A2A4A]">
                  {streamTypes.map(t => (
                    <SelectItem key={t} value={t} className="text-white">{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tags */}
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
                    {tag}
                    <button onClick={() => setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))}><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Equipment Checklist */}
          {equipment && equipment.length > 0 && (
            <div>
              <Label className="text-[#A0A0B0] text-xs">Equipment Checklist</Label>
              <div className="grid grid-cols-2 gap-2 mt-1 max-h-32 overflow-y-auto">
                {equipment.map(eq => (
                  <button
                    key={eq.id}
                    onClick={() => toggleEquipment(eq.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs text-left transition-smooth ${
                      form.equipment_ids?.includes(eq.id)
                        ? 'border-[#2ED573] bg-[#2ED573]/10 text-[#2ED573]'
                        : 'border-[#2A2A4A] bg-[#16213E] text-[#A0A0B0] hover:border-[#6B6B80]'
                    }`}
                  >
                    <span className="truncate">{eq.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <Label className="text-[#A0A0B0] text-xs">Description</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Stream description..." rows={3} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="border-[#2A2A4A] text-[#A0A0B0] hover:bg-white/5">Cancel</Button>
            <Button
              onClick={() => onSave({ ...form, status: "draft" })}
              variant="outline"
              className="border-[#2A2A4A] text-white hover:bg-white/5 gap-1.5"
            >
              <FileText size={14} />Save Draft
            </Button>
            <Button
              onClick={() => onSave({ ...form, status: "scheduled" })}
              className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white gap-1.5"
            >
              <Save size={14} />Schedule
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}