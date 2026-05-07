import React, { useState, useEffect } from "react";
import { useQuery } from "@apollo/client";
import { GET_STREAMER_ME } from "@/graphql/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Palette, Bell, LogOut, Save } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";

export default function Settings() {
  const [saving, setSaving] = useState(false);

  const { data, refetch } = useQuery(GET_STREAMER_ME);
  const user = data?.streamerMe;

  const [profile, setProfile] = useState({ full_name: "", timezone: "" });

  useEffect(() => {
    if (user) {
      const displayName = user.displayName || [user.firstName, user.lastName].filter(Boolean).join(" ") || "";
      setProfile({
        full_name: displayName,
        timezone: user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    }
  }, [user]);

  const saveProfile = async () => {
    setSaving(true);
    // TODO: Wire up updateMe mutation when GraphQL resolver is ready
    console.log("updateMe stub – saving timezone:", profile.timezone);
    refetch();
    setSaving(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    window.location.href = "/login";
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Settings" description="Manage your account preferences" />

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-[#1A1A2E] border border-[#2A2A4A]">
          <TabsTrigger value="profile" className="text-xs data-[state=active]:bg-[#6C63FF] data-[state=active]:text-white"><User size={12} className="mr-1.5" />Profile</TabsTrigger>
          <TabsTrigger value="appearance" className="text-xs data-[state=active]:bg-[#6C63FF] data-[state=active]:text-white"><Palette size={12} className="mr-1.5" />Appearance</TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs data-[state=active]:bg-[#6C63FF] data-[state=active]:text-white"><Bell size={12} className="mr-1.5" />Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] p-6 space-y-5">
            <div>
              <Label className="text-[#A0A0B0] text-xs">Display Name</Label>
              <Input value={profile.full_name} disabled className="bg-[#16213E] border-[#2A2A4A] text-[#6B6B80] mt-1" />
              <p className="text-[10px] text-[#6B6B80] mt-1">Name cannot be changed here</p>
            </div>
            <div>
              <Label className="text-[#A0A0B0] text-xs">Email</Label>
              <Input value={user?.email || ""} disabled className="bg-[#16213E] border-[#2A2A4A] text-[#6B6B80] mt-1" />
            </div>
            <div>
              <Label className="text-[#A0A0B0] text-xs">Timezone</Label>
              <Input
                value={profile.timezone}
                onChange={e => setProfile({ ...profile, timezone: e.target.value })}
                className="bg-[#16213E] border-[#2A2A4A] text-white mt-1"
              />
            </div>
            <div className="flex justify-between items-center pt-2">
              <Button onClick={saveProfile} disabled={saving} className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white gap-1.5">
                <Save size={14} />{saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                onClick={handleLogout}
                variant="outline"
                className="border-[#FF4757]/30 text-[#FF4757] hover:bg-[#FF4757]/10 gap-1.5"
              >
                <LogOut size={14} />Log Out
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="appearance">
          <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] p-6">
            <h3 className="text-sm font-semibold text-white mb-4">Theme</h3>
            <div className="flex gap-3">
              <button className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-[#6C63FF] bg-[#0F0F0F]">
                <div className="w-16 h-10 rounded-lg bg-[#1A1A2E] border border-[#2A2A4A]" />
                <span className="text-xs text-[#6C63FF] font-medium">Dark</span>
              </button>
              <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[#2A2A4A] bg-[#16213E] opacity-50 cursor-not-allowed">
                <div className="w-16 h-10 rounded-lg bg-white border border-gray-200" />
                <span className="text-xs text-[#6B6B80]">Light (soon)</span>
              </button>
            </div>

            <h3 className="text-sm font-semibold text-white mt-6 mb-4">Accent Color</h3>
            <div className="flex gap-2">
              {["#6C63FF", "#00D4AA", "#FF4757", "#FFA502", "#9146FF", "#69C9D0"].map(color => (
                <button
                  key={color}
                  className={`w-8 h-8 rounded-full border-2 transition-smooth ${color === "#6C63FF" ? "border-white scale-110" : "border-transparent hover:border-white/50"}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] p-6 space-y-4">
            {[
              { type: "Stream Reminders", desc: "Get notified before your streams" },
              { type: "Collab Requests", desc: "When someone wants to collaborate" },
              { type: "Equipment Alerts", desc: "Warranty and maintenance alerts" },
              { type: "Milestones", desc: "Achievement notifications" },
              { type: "System Updates", desc: "New features and updates" },
            ].map(item => (
              <div key={item.type} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-white">{item.type}</p>
                  <p className="text-xs text-[#6B6B80]">{item.desc}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-9 h-5 bg-[#2A2A4A] rounded-full peer peer-checked:bg-[#6C63FF] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                </label>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
