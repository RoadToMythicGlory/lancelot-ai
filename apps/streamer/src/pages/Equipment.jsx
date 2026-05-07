import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Grid3X3, List, Wrench, Pencil, Trash2 } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

const categories = ["camera", "microphone", "lighting", "capture_card", "computer", "audio_interface", "green_screen", "chair", "other"];
const statuses = ["ready", "needs_setup", "charging", "broken", "in_repair", "retired"];
const conditions = ["excellent", "good", "fair", "poor"];
const categoryIcons = { camera: "📷", microphone: "🎙️", lighting: "💡", capture_card: "🎮", computer: "💻", audio_interface: "🎛️", green_screen: "🟩", chair: "🪑", other: "📦" };

export default function Equipment() {
  const [view, setView] = useState("grid");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: "", category: "camera", brand: "", model: "", status: "ready", condition: "good", purchase_date: "", purchase_price: "", notes: "", serial_number: "", warranty_expiry: "" });

  // Placeholder: no GraphQL resolver for Equipment yet
  const [items, setItems] = useState([]);

  const handleSave = () => {
    if (editItem) {
      setItems(prev => prev.map(i => i.id === editItem.id ? { ...i, ...form } : i));
      console.log("Equipment.update stub:", editItem.id, form);
    } else {
      const newItem = { ...form, id: Date.now().toString(), created_date: new Date().toISOString() };
      setItems(prev => [newItem, ...prev]);
      console.log("Equipment.create stub:", form);
    }
    setModalOpen(false);
    setEditItem(null);
  };

  const handleDelete = (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    console.log("Equipment.delete stub:", id);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ name: item.name || "", category: item.category || "camera", brand: item.brand || "", model: item.model || "", status: item.status || "ready", condition: item.condition || "good", purchase_date: item.purchase_date || "", purchase_price: item.purchase_price || "", notes: item.notes || "", serial_number: item.serial_number || "", warranty_expiry: item.warranty_expiry || "" });
    setModalOpen(true);
  };

  const openNew = () => {
    setEditItem(null);
    setForm({ name: "", category: "camera", brand: "", model: "", status: "ready", condition: "good", purchase_date: "", purchase_price: "", notes: "", serial_number: "", warranty_expiry: "" });
    setModalOpen(true);
  };

  const filtered = items.filter(item => {
    const matchSearch = !search || item.name?.toLowerCase().includes(search.toLowerCase()) || item.brand?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || item.category === filterCat;
    const matchStatus = filterStatus === "all" || item.status === filterStatus;
    return matchSearch && matchCat && matchStatus;
  });

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Equipment Manager" description="Track your streaming gear" actions={
        <Button onClick={openNew} className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white text-xs gap-1.5 h-8"><Plus size={14} />Add Equipment</Button>
      } />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B80]" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search equipment..." className="bg-[#1A1A2E] border-[#2A2A4A] text-white pl-9 text-xs h-8" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-36 bg-[#1A1A2E] border-[#2A2A4A] text-white text-xs h-8"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[#16213E] border-[#2A2A4A]">
            <SelectItem value="all" className="text-white">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c} className="text-white">{c.replace(/_/g, " ").replace(/\b\w/g, x => x.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32 bg-[#1A1A2E] border-[#2A2A4A] text-white text-xs h-8"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[#16213E] border-[#2A2A4A]">
            <SelectItem value="all" className="text-white">All Status</SelectItem>
            {statuses.map(s => <SelectItem key={s} value={s} className="text-white">{s.replace(/_/g, " ").replace(/\b\w/g, x => x.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex rounded-lg border border-[#2A2A4A] overflow-hidden ml-auto">
          <button onClick={() => setView("grid")} className={`px-3 py-1.5 text-xs ${view === "grid" ? "bg-[#6C63FF] text-white" : "text-[#6B6B80]"}`}><Grid3X3 size={14} /></button>
          <button onClick={() => setView("list")} className={`px-3 py-1.5 text-xs ${view === "list" ? "bg-[#6C63FF] text-white" : "text-[#6B6B80]"}`}><List size={14} /></button>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState icon={Wrench} title="No equipment found" description="Add your first piece of gear" actionLabel="Add Equipment" onAction={openNew} />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(item => (
            <div key={item.id} className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] p-4 hover:border-[#6C63FF]/30 transition-smooth group">
              <div className="flex items-start justify-between">
                <span className="text-2xl">{categoryIcons[item.category] || "📦"}</span>
                <StatusBadge status={item.status} />
              </div>
              <h3 className="text-sm font-semibold text-white mt-3 truncate">{item.name}</h3>
              <p className="text-xs text-[#6B6B80] mt-0.5">{item.brand} {item.model}</p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#6C63FF]/10 text-[#6C63FF]">{item.category?.replace(/_/g, " ")}</span>
                <span className="text-[10px] text-[#6B6B80]">{item.condition}</span>
              </div>
              <div className="flex gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-[#6B6B80] hover:text-white hover:bg-white/5"><Pencil size={12} /></button>
                <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg text-[#6B6B80] hover:text-[#FF4757] hover:bg-[#FF4757]/10"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-[#2A2A4A]">
              <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Name</th>
              <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Category</th>
              <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Status</th>
              <th className="text-left text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Condition</th>
              <th className="text-right text-[10px] font-medium text-[#6B6B80] uppercase px-4 py-2">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-[#2A2A4A]/50">
              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5"><span className="text-sm text-white">{item.name}</span><span className="text-xs text-[#6B6B80] ml-2">{item.brand}</span></td>
                  <td className="px-4 py-2.5 text-xs text-[#A0A0B0]">{item.category?.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={item.status} /></td>
                  <td className="px-4 py-2.5 text-xs text-[#A0A0B0] capitalize">{item.condition}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => openEdit(item)} className="p-1 text-[#6B6B80] hover:text-white"><Pencil size={13} /></button>
                    <button onClick={() => handleDelete(item.id)} className="p-1 text-[#6B6B80] hover:text-[#FF4757] ml-1"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Modal */}
      <Dialog open={modalOpen} onOpenChange={() => { setModalOpen(false); setEditItem(null); }}>
        <DialogContent className="bg-[#1A1A2E] border-[#2A2A4A] text-white max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-white">{editItem ? "Edit Equipment" : "Add Equipment"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div><Label className="text-[#A0A0B0] text-xs">Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[#A0A0B0] text-xs">Category</Label><Select value={form.category} onValueChange={v => setForm({...form, category: v})}><SelectTrigger className="bg-[#16213E] border-[#2A2A4A] text-white mt-1"><SelectValue /></SelectTrigger><SelectContent className="bg-[#16213E] border-[#2A2A4A]">{categories.map(c => <SelectItem key={c} value={c} className="text-white">{c.replace(/_/g," ").replace(/\b\w/g,x=>x.toUpperCase())}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-[#A0A0B0] text-xs">Status</Label><Select value={form.status} onValueChange={v => setForm({...form, status: v})}><SelectTrigger className="bg-[#16213E] border-[#2A2A4A] text-white mt-1"><SelectValue /></SelectTrigger><SelectContent className="bg-[#16213E] border-[#2A2A4A]">{statuses.map(s => <SelectItem key={s} value={s} className="text-white">{s.replace(/_/g," ").replace(/\b\w/g,x=>x.toUpperCase())}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[#A0A0B0] text-xs">Brand</Label><Input value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
              <div><Label className="text-[#A0A0B0] text-xs">Model</Label><Input value={form.model} onChange={e => setForm({...form, model: e.target.value})} className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" /></div>
            </div>
            <div><Label className="text-[#A0A0B0] text-xs">Condition</Label><Select value={form.condition} onValueChange={v => setForm({...form, condition: v})}><SelectTrigger className="bg-[#16213E] border-[#2A2A4A] text-white mt-1"><SelectValue /></SelectTrigger><SelectContent className="bg-[#16213E] border-[#2A2A4A]">{conditions.map(c => <SelectItem key={c} value={c} className="text-white capitalize">{c}</SelectItem>)}</SelectContent></Select></div>
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
