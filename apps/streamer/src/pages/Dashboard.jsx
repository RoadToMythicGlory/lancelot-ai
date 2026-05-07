import React from "react";
import { useQuery } from "@apollo/client";
import { GET_STREAM_EVENTS, GET_PODCAST_EPISODES, GET_GUEST_CONTACTS, GET_STREAMER_ACTIVITIES } from "@/graphql/queries";
import MetricsRow from "@/components/dashboard/MetricsRow";
import PodcastMetrics from "@/components/dashboard/PodcastMetrics";
import UpcomingStreams from "@/components/dashboard/UpcomingStreams";
import UpcomingRecordings from "@/components/dashboard/UpcomingRecordings";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import QuickActions from "@/components/dashboard/QuickActions";

export default function Dashboard() {
  const { data: streamsData } = useQuery(GET_STREAM_EVENTS, { variables: { limit: 50 } });
  const { data: episodesData } = useQuery(GET_PODCAST_EPISODES, { variables: { limit: 50 } });
  const { data: guestsData } = useQuery(GET_GUEST_CONTACTS, {});
  const { data: activitiesData } = useQuery(GET_STREAMER_ACTIVITIES, { variables: { limit: 15 } });

  const streams = streamsData?.streamerEvents || [];
  const episodes = episodesData?.podcastEpisodes || [];
  const guests = guestsData?.guestContacts || [];
  const activities = activitiesData?.streamerActivities || [];

  // Collaborations count from stream collaborators
  const collabs = streams.reduce((acc, s) => acc + (s.collaborators?.length || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h3 className="text-sm font-semibold text-[#6B6B80] uppercase tracking-wider mb-3">Streaming</h3>
        <MetricsRow streams={streams} collabs={{ length: collabs }} />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[#6B6B80] uppercase tracking-wider mb-3">Podcast</h3>
        <PodcastMetrics episodes={episodes} guests={guests} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UpcomingStreams streams={streams} />
        <UpcomingRecordings episodes={episodes} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lg:col-span-2">
          <ActivityFeed activities={activities} />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[#6B6B80] uppercase tracking-wider mb-3">Quick Actions</h3>
        <QuickActions />
      </div>
    </div>
  );
}
