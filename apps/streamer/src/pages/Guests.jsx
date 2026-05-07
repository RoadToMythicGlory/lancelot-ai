import React, { useState } from "react";
import { useQuery } from "@apollo/client";
import { GET_GUEST_CONTACTS } from "@/graphql/queries";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Mail, Calendar, Star, Users } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";

export default function Guests() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data } = useQuery(GET_GUEST_CONTACTS);
  const guests = data?.guestContacts || [];

  const filteredGuests = guests.filter((guest) => {
    const matchesSearch = guest.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || guest.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guest Manager"
        description="Find and manage podcast guests"
        actions={
          <Button className="bg-[#FFA502] hover:bg-[#E69500] text-white gap-2">
            <Plus size={16} />
            Add Guest
          </Button>
        }
      />

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B80]" />
          <Input
            placeholder="Search guests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-[#1A1A2E] border-[#2A2A4A] text-white"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 bg-[#1A1A2E] border-[#2A2A4A] text-white">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="potential">Potential</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="appeared">Appeared</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredGuests.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No guests found"
          description="Add your first guest to start building your network"
          actionLabel="Add Guest"
          onAction={() => {}}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGuests.map((guest) => (
            <div
              key={guest.id}
              className="bg-[#1A1A2E] rounded-xl border border-[#2A2A4A] p-5 hover:border-[#FFA502]/30 transition-smooth cursor-pointer"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-[#FFA502]/10 flex items-center justify-center text-[#FFA502] font-bold text-lg shrink-0">
                  {guest.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white truncate">{guest.name}</h3>
                  {guest.title && <p className="text-xs text-[#6B6B80]">{guest.title}</p>}
                  {guest.company && <p className="text-xs text-[#6B6B80]">{guest.company}</p>}
                </div>
              </div>

              {guest.topicsExpertise?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {guest.topicsExpertise.slice(0, 3).map((topic, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-[#2A2A4A] rounded text-xs text-[#A0A0B0]">
                      {topic}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mb-4">
                <StatusBadge status={guest.status} />
                {guest.rating && (
                  <div className="flex items-center gap-1 text-[#FFA502]">
                    <Star size={12} fill="currentColor" />
                    <span className="text-xs">{guest.rating}</span>
                  </div>
                )}
              </div>

              {guest.previousAppearances?.length > 0 && (
                <p className="text-xs text-[#6B6B80] mb-3">
                  {guest.previousAppearances.length} previous appearance
                  {guest.previousAppearances.length > 1 ? "s" : ""}
                </p>
              )}

              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="flex-1 gap-2 text-xs h-8">
                  <Mail size={12} />
                  Email
                </Button>
                <Button size="sm" variant="ghost" className="flex-1 gap-2 text-xs h-8">
                  <Calendar size={12} />
                  Schedule
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
