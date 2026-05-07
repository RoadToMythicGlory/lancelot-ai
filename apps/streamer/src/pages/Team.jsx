import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, UserCog, Shield, Mail } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

const roles = ["admin", "user"];

export default function Team() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [inviting, setInviting] = useState(false);

  // Placeholder: no GraphQL resolver for team members yet
  const [users] = useState([]);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setInviting(true);
    // TODO: Wire up invite mutation when GraphQL resolver is ready
    console.log("inviteUser stub – email:", email, "role:", role);
    setEmail("");
    setInviteOpen(false);
    setInviting(false);
  };

  const roleColors = {
    admin: "bg-[#FF4757]/15 text-[#FF4757] border-[#FF4757]/30",
    user: "bg-[#6C63FF]/15 text-[#6C63FF] border-[#6C63FF]/30",
  };

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Team" description="Manage your team members" actions={
        <Button onClick={() => setInviteOpen(true)} className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white text-xs gap-1.5 h-8">
          <UserPlus size={14} />Invite Member
        </Button>
      } />

      {users.length === 0 ? (
        <EmptyState icon={UserCog} title="No team members" description="Invite your first team member" actionLabel="Invite" onAction={() => setInviteOpen(true)} />
      ) : (
        <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden divide-y divide-[#2A2A4A]/50">
          {users.map(user => (
            <div key={user.id} className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-smooth">
              <div className="w-10 h-10 rounded-full bg-[#6C63FF] flex items-center justify-center text-white font-bold text-sm shrink-0">
                {user.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{user.full_name || "Unnamed"}</p>
                <p className="text-xs text-[#6B6B80]">{user.email}</p>
              </div>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${roleColors[user.role] || roleColors.user}`}>
                <Shield size={10} />
                {user.role || "user"}
              </span>
            </div>
          ))}
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="bg-[#1A1A2E] border-[#2A2A4A] text-white max-w-sm">
          <DialogHeader><DialogTitle className="text-white">Invite Team Member</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-[#A0A0B0] text-xs">Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="team@example.com" className="bg-[#16213E] border-[#2A2A4A] text-white mt-1" />
            </div>
            <div>
              <Label className="text-[#A0A0B0] text-xs">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="bg-[#16213E] border-[#2A2A4A] text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#16213E] border-[#2A2A4A]">
                  {roles.map(r => <SelectItem key={r} value={r} className="text-white capitalize">{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setInviteOpen(false)} className="border-[#2A2A4A] text-[#A0A0B0]">Cancel</Button>
              <Button onClick={handleInvite} disabled={inviting} className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white gap-1.5">
                <Mail size={14} />{inviting ? "Sending..." : "Send Invite"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
