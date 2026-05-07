import React from "react";
import { useQuery } from "@apollo/client";
import { GET_PODCAST_SHOWS } from "@/graphql/queries";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus, Radio } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";

const categoryColors = {
  technology: "#6C63FF",
  business: "#00D4AA",
  comedy: "#FF4757",
  education: "#FFA502",
  health: "#1DB954",
  news: "#872EC4",
  sports: "#25D1DA",
  entertainment: "#FC7E0F",
  society: "#F43E37",
  science: "#69C9D0",
  arts: "#9146FF",
  gaming: "#6C63FF",
  music: "#FF4757",
  true_crime: "#872EC4",
  other: "#6B6B80",
};

export default function Shows() {
  const { data } = useQuery(GET_PODCAST_SHOWS);
  const shows = data?.podcastShows || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Shows"
        description="Manage your podcast series"
        actions={
          <Button className="bg-[#FFA502] hover:bg-[#E69500] text-white gap-2">
            <Plus size={16} />
            New Show
          </Button>
        }
      />

      {shows.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No podcast shows yet"
          description="Create your first podcast show to get started"
          actionLabel="Create Show"
          onAction={() => {}}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shows.map((show) => (
            <div
              key={show.id}
              className="bg-[#1A1A2E] rounded-xl border border-[#2A2A4A] overflow-hidden hover:border-[#FFA502]/30 transition-smooth cursor-pointer"
            >
              <div className="aspect-square bg-gradient-to-br from-[#2A2A4A] to-[#1A1A2E] flex items-center justify-center">
                {show.coverArtUrl ? (
                  <img src={show.coverArtUrl} alt={show.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-5xl font-bold text-[#6B6B80]">
                    {show.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="p-5">
                <h3 className="text-lg font-bold text-white mb-2">{show.name}</h3>
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="px-2 py-1 rounded text-xs font-medium"
                    style={{
                      backgroundColor: `${categoryColors[show.category] || "#6B6B80"}15`,
                      color: categoryColors[show.category] || "#6B6B80",
                    }}
                  >
                    {show.category}
                  </span>
                  <span className="px-2 py-1 rounded text-xs bg-[#2A2A4A] text-[#A0A0B0]">
                    {show.frequency}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-[#6B6B80]">
                  <span>{show.totalEpisodes || 0} episodes</span>
                  <span className={show.isActive ? "text-[#1DB954]" : "text-[#FF4757]"}>
                    {show.isActive ? "Active" : "Paused"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
