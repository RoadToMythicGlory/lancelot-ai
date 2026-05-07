import React from "react";
import { useQuery, useMutation } from "@apollo/client";
import { GET_NOTIFICATIONS } from "@/graphql/queries";
import { MARK_NOTIFICATION_READ, MARK_ALL_NOTIFICATIONS_READ } from "@/graphql/mutations";
import { Button } from "@/components/ui/button";
import { Bell, Calendar, Users, Wrench, Award, Monitor, CheckCheck } from "lucide-react";
import moment from "moment";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

const typeIcons = {
  stream_reminder: Calendar,
  collab_request: Users,
  collab_update: Users,
  equipment_alert: Wrench,
  milestone: Award,
  system: Monitor,
};

const typeColors = {
  stream_reminder: "#6C63FF",
  collab_request: "#FFA502",
  collab_update: "#00D4AA",
  equipment_alert: "#FF4757",
  milestone: "#2ED573",
  system: "#69C9D0",
};

export default function Notifications() {
  const { data, refetch } = useQuery(GET_NOTIFICATIONS, { variables: { limit: 100 } });
  const notificationsData = data?.notifications || {};
  const notifications = notificationsData.items || [];
  const unreadCount = notificationsData.unreadCount ?? notifications.filter(n => !n.isRead).length;

  const [markRead] = useMutation(MARK_NOTIFICATION_READ, { onCompleted: () => refetch() });
  const [markAllRead] = useMutation(MARK_ALL_NOTIFICATIONS_READ, { onCompleted: () => refetch() });

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        actions={
          unreadCount > 0 && (
            <Button
              onClick={() => markAllRead()}
              variant="outline"
              className="border-[#2A2A4A] text-[#A0A0B0] hover:text-white hover:bg-white/5 text-xs gap-1.5 h-8"
            >
              <CheckCheck size={14} />Mark All Read
            </Button>
          )
        }
      />

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="You're all caught up!" />
      ) : (
        <div className="rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden divide-y divide-[#2A2A4A]/50">
          {notifications.map(n => {
            const Icon = typeIcons[n.type] || Bell;
            const color = typeColors[n.type] || "#6B6B80";
            return (
              <div
                key={n.id}
                onClick={() => !n.isRead && markRead({ variables: { id: n.id } })}
                className={`flex items-start gap-3 px-5 py-4 transition-smooth cursor-pointer ${
                  n.isRead ? "opacity-60" : "hover:bg-white/[0.02]"
                }`}
              >
                <div className="p-2 rounded-lg shrink-0 mt-0.5" style={{ backgroundColor: `${color}15` }}>
                  <Icon size={14} style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-white">{n.title}</p>
                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-[#6C63FF] shrink-0 mt-1.5" />}
                  </div>
                  {n.message && <p className="text-xs text-[#A0A0B0] mt-0.5">{n.message}</p>}
                  <p className="text-[10px] text-[#6B6B80] mt-1">{moment(n.createdAt).fromNow()}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
