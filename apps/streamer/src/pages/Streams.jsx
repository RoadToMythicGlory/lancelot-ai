import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { GET_STREAM_EVENTS } from "@/graphql/queries";
import { CREATE_STREAM_EVENT, UPDATE_STREAM_EVENT, DELETE_STREAM_EVENT } from "@/graphql/mutations";
import { Button } from "@/components/ui/button";
import { Plus, List, CalendarDays, ChevronLeft, ChevronRight, Trash2, Pencil } from "lucide-react";
import moment from "moment";
import PlatformIcon from "@/components/ui/PlatformIcon";
import StatusBadge from "@/components/ui/StatusBadge";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import StreamFormModal from "@/components/streams/StreamFormModal";

export default function Streams() {
  const [view, setView] = useState("month");
  const [currentMonth, setCurrentMonth] = useState(moment());
  const [modalOpen, setModalOpen] = useState(false);
  const [editStream, setEditStream] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "true") setModalOpen(true);
  }, []);

  const { data: streamsData, refetch } = useQuery(GET_STREAM_EVENTS, { variables: { limit: 200 } });
  const streams = streamsData?.streamerEvents || [];

  const [createStream] = useMutation(CREATE_STREAM_EVENT, { onCompleted: () => { refetch(); setModalOpen(false); setEditStream(null); } });
  const [updateStream] = useMutation(UPDATE_STREAM_EVENT, { onCompleted: () => { refetch(); setModalOpen(false); setEditStream(null); } });
  const [deleteStream] = useMutation(DELETE_STREAM_EVENT, { onCompleted: () => refetch() });

  const handleSave = (data) => {
    if (editStream) {
      updateStream({ variables: { id: editStream.id, input: data } });
    } else {
      createStream({ variables: { input: data } });
    }
  };

  const daysInMonth = currentMonth.daysInMonth();
  const firstDay = moment(currentMonth).startOf("month").day();
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const getStreamsForDay = (day) => {
    const dateStr = moment(currentMonth).date(day).format("YYYY-MM-DD");
    return streams.filter(s => s.scheduledDate === dateStr);
  };

  const platformDot = {
    twitch: "bg-[#9146FF]", youtube: "bg-[#FF0000]", kick: "bg-[#53FC18]", tiktok: "bg-[#69C9D0]"
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Stream Calendar"
        description="Plan and manage your streams"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-[#2A2A4A] overflow-hidden">
              <button onClick={() => setView("month")} className={`px-3 py-1.5 text-xs font-medium transition-smooth ${view === "month" ? "bg-[#6C63FF] text-white" : "text-[#6B6B80] hover:text-white"}`}>
                <CalendarDays size={14} />
              </button>
              <button onClick={() => setView("list")} className={`px-3 py-1.5 text-xs font-medium transition-smooth ${view === "list" ? "bg-[#6C63FF] text-white" : "text-[#6B6B80] hover:text-white"}`}>
                <List size={14} />
              </button>
            </div>
            <Button onClick={() => { setEditStream(null); setModalOpen(true); }} className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white text-xs gap-1.5 h-8">
              <Plus size={14} />New Stream
            </Button>
          </div>
        }
      />

      {view === "month" ? (
        <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#2A2A4A]">
            <button onClick={() => setCurrentMonth(m => moment(m).subtract(1, "month"))} className="p-1.5 rounded-lg text-[#6B6B80] hover:text-white hover:bg-white/5"><ChevronLeft size={16} /></button>
            <span className="text-sm font-semibold text-white">{currentMonth.format("MMMM YYYY")}</span>
            <button onClick={() => setCurrentMonth(m => moment(m).add(1, "month"))} className="p-1.5 rounded-lg text-[#6B6B80] hover:text-white hover:bg-white/5"><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-7 border-b border-[#2A2A4A]">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
              <div key={d} className="py-2 text-center text-[10px] font-medium text-[#6B6B80] uppercase tracking-wider">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const dayStreams = day ? getStreamsForDay(day) : [];
              const isToday = day && moment(currentMonth).date(day).isSame(moment(), "day");
              return (
                <div key={i} className={`min-h-[80px] p-1.5 border-b border-r border-[#2A2A4A]/30 ${!day ? "bg-[#0F0F0F]/30" : "hover:bg-white/[0.02]"}`}>
                  {day && (
                    <>
                      <span className={`text-xs font-medium ${isToday ? "bg-[#6C63FF] text-white w-5 h-5 rounded-full flex items-center justify-center" : "text-[#6B6B80]"}`}>{day}</span>
                      <div className="mt-1 space-y-0.5">
                        {dayStreams.slice(0, 3).map(s => (
                          <button key={s.id} onClick={() => { setEditStream(s); setModalOpen(true); }}
                            className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium text-white truncate bg-[#6C63FF]/20 hover:bg-[#6C63FF]/30 transition-smooth flex items-center gap-1">
                            {s.platforms?.map(p => <span key={p} className={`w-1.5 h-1.5 rounded-full ${platformDot[p] || "bg-gray-500"} shrink-0`} />)}
                            <span className="truncate">{s.title}</span>
                          </button>
                        ))}
                        {dayStreams.length > 3 && <span className="text-[10px] text-[#6B6B80] pl-1">+{dayStreams.length - 3} more</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden">
          {streams.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No streams yet" description="Schedule your first stream to get started" actionLabel="New Stream" onAction={() => setModalOpen(true)} />
          ) : (
            <div className="divide-y divide-[#2A2A4A]/50">
              {streams.map(s => (
                <div key={s.id} className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-smooth">
                  <div className="w-16 text-center shrink-0">
                    <p className="text-lg font-bold text-white">{moment(s.scheduledDate).format("DD")}</p>
                    <p className="text-[10px] text-[#6B6B80] uppercase">{moment(s.scheduledDate).format("MMM")}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{s.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {s.startTime && <span className="text-xs text-[#6B6B80]">{s.startTime}{s.endTime && ` - ${s.endTime}`}</span>}
                      <div className="flex gap-1">{s.platforms?.map(p => <PlatformIcon key={p} platform={p} size={12} />)}</div>
                      {s.category && <span className="text-xs text-[#6B6B80]">• {s.category}</span>}
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                  <div className="flex gap-1">
                    <button onClick={() => { setEditStream(s); setModalOpen(true); }} className="p-1.5 rounded-lg text-[#6B6B80] hover:text-white hover:bg-white/5"><Pencil size={14} /></button>
                    <button onClick={() => deleteStream({ variables: { id: s.id } })} className="p-1.5 rounded-lg text-[#6B6B80] hover:text-[#FF4757] hover:bg-[#FF4757]/10"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <StreamFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditStream(null); }}
        onSave={handleSave}
        stream={editStream}
        equipment={[]}
      />
    </div>
  );
}
