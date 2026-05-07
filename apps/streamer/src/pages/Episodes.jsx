import React, { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { GET_PODCAST_EPISODES } from "@/graphql/queries";
import { UPDATE_PODCAST_EPISODE } from "@/graphql/mutations";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus, LayoutGrid, List, Calendar as CalendarIcon } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import StatusBadge from "@/components/ui/StatusBadge";
import moment from "moment";

const statusColumns = [
  { id: "idea", label: "Idea", color: "#6B6B80" },
  { id: "scripted", label: "Scripted", color: "#00D4AA" },
  { id: "scheduled", label: "Scheduled", color: "#6C63FF" },
  { id: "recording", label: "Recording", color: "#FF4757" },
  { id: "editing", label: "Editing", color: "#FFA502" },
  { id: "review", label: "Review", color: "#9146FF" },
  { id: "published", label: "Published", color: "#1DB954" },
];

export default function Episodes() {
  const [view, setView] = useState("kanban");

  const { data: episodesData, refetch } = useQuery(GET_PODCAST_EPISODES, { variables: { limit: 100 } });
  const episodes = episodesData?.podcastEpisodes || [];

  const [updateEpisode] = useMutation(UPDATE_PODCAST_EPISODE, { onCompleted: () => refetch() });

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const episode = episodes.find((e) => e.id === draggableId);
    if (episode && episode.status !== destination.droppableId) {
      updateEpisode({ variables: { id: draggableId, input: { status: destination.droppableId } } });
    }
  };

  const episodesByStatus = (status) => episodes.filter((e) => e.status === status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Podcast Episodes"
        description="Plan, record, and publish your episodes"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-[#1A1A2E] rounded-lg p-1">
              <Button
                size="sm"
                variant={view === "kanban" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => setView("kanban")}
              >
                <LayoutGrid size={14} />
              </Button>
              <Button
                size="sm"
                variant={view === "list" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => setView("list")}
              >
                <List size={14} />
              </Button>
              <Button
                size="sm"
                variant={view === "calendar" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => setView("calendar")}
              >
                <CalendarIcon size={14} />
              </Button>
            </div>
            <Button className="bg-[#FFA502] hover:bg-[#E69500] text-white gap-2">
              <Plus size={16} />
              New Episode
            </Button>
          </div>
        }
      />

      {view === "kanban" && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {statusColumns.map((column) => {
              const columnEpisodes = episodesByStatus(column.id);
              return (
                <Droppable key={column.id} droppableId={column.id}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="flex-shrink-0 w-80 bg-[#1A1A2E] rounded-xl border border-[#2A2A4A] p-4"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: column.color }} />
                          {column.label}
                        </h3>
                        <span className="text-xs text-[#6B6B80] bg-[#0F0F0F] px-2 py-0.5 rounded-full">
                          {columnEpisodes.length}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {columnEpisodes.map((episode, index) => (
                          <Draggable key={episode.id} draggableId={episode.id} index={index}>
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className="bg-[#0F0F0F] rounded-lg p-3 border border-[#2A2A4A] hover:border-[#FFA502]/30 transition-smooth cursor-pointer"
                              >
                                <h4 className="text-sm font-medium text-white mb-2">{episode.title}</h4>
                                {episode.show_name && (
                                  <div className="inline-block px-2 py-0.5 bg-[#FFA502]/10 rounded text-xs text-[#FFA502] mb-2">
                                    {episode.show_name}
                                  </div>
                                )}
                                {episode.episode_number && (
                                  <p className="text-xs text-[#6B6B80] mb-2">
                                    S{episode.season_number || 1} E{episode.episode_number}
                                  </p>
                                )}
                                {episode.scheduled_record_date && (
                                  <p className="text-xs text-[#A0A0B0]">
                                    {moment(episode.scheduled_record_date).format("MMM D")}
                                  </p>
                                )}
                                {episode.format && (
                                  <div className="mt-2 inline-block px-2 py-0.5 bg-[#2A2A4A] rounded text-xs text-[#A0A0B0]">
                                    {episode.format}
                                  </div>
                                )}
                                {episode.guests?.length > 0 && (
                                  <div className="mt-2 text-xs text-[#6B6B80]">
                                    {episode.guests.length} guest{episode.guests.length > 1 ? "s" : ""}
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    </div>
                  )}
                </Droppable>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {view === "list" && (
        <div className="bg-[#1A1A2E] rounded-xl border border-[#2A2A4A] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2A2A4A]">
                <th className="text-left text-xs font-semibold text-[#6B6B80] uppercase px-6 py-3">#</th>
                <th className="text-left text-xs font-semibold text-[#6B6B80] uppercase px-6 py-3">Title</th>
                <th className="text-left text-xs font-semibold text-[#6B6B80] uppercase px-6 py-3">Show</th>
                <th className="text-left text-xs font-semibold text-[#6B6B80] uppercase px-6 py-3">Format</th>
                <th className="text-left text-xs font-semibold text-[#6B6B80] uppercase px-6 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-[#6B6B80] uppercase px-6 py-3">Record Date</th>
                <th className="text-left text-xs font-semibold text-[#6B6B80] uppercase px-6 py-3">Downloads</th>
              </tr>
            </thead>
            <tbody>
              {episodes.map((episode) => (
                <tr key={episode.id} className="border-b border-[#2A2A4A]/50 hover:bg-white/[0.02] transition-smooth">
                  <td className="px-6 py-4 text-sm text-[#6B6B80]">
                    S{episode.season_number || 1}E{episode.episode_number || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-white font-medium">{episode.title}</td>
                  <td className="px-6 py-4 text-sm text-[#A0A0B0]">{episode.show_name || "-"}</td>
                  <td className="px-6 py-4 text-sm text-[#A0A0B0]">{episode.format || "-"}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={episode.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-[#A0A0B0]">
                    {episode.scheduled_record_date ? moment(episode.scheduled_record_date).format("MMM D, YYYY") : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-[#A0A0B0]">
                    {episode.metrics?.downloads?.toLocaleString() || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "calendar" && (
        <div className="bg-[#1A1A2E] rounded-xl border border-[#2A2A4A] p-6">
          <p className="text-center text-[#6B6B80]">Calendar view coming soon</p>
        </div>
      )}
    </div>
  );
}