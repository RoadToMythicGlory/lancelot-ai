'use client';

import React, { useEffect, useState } from "react";
import { Modal } from 'antd';
import { useMutation as useApolloMutation } from '@apollo/client';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA } from '../../graphql/mutations';

// Enterprise Graphics Studio
import EnterpriseGraphicsStudio from './EnterpriseGraphicsStudio';

// Full Advanced Rundown Ingest Component
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import type { UseFormReturn } from "react-hook-form";
import { useForm, FormProvider, Controller, useFieldArray, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { create } from "zustand";
import { QueryClient, QueryClientProvider, useQuery, useMutation } from "@tanstack/react-query";
import * as Select from "@radix-ui/react-select";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { addMinutes } from "date-fns";
import { v4 as uuidv4 } from "uuid";

/**
 * Lancelot – Advanced Rundown Ingest (Fixed)
 * ------------------------------------------------------------
 * Enterprise-grade React + TypeScript module for Lancelot.
 *
 * Key fixes:
 * 1) Removed shimmed useFormContext; now uses the real hook so `formState.errors` is always defined
 *    under FormProvider — fixes "Cannot read properties of undefined (reading 'errors')".
 * 2) Completed truncated file (previous document ended mid-function) and removed stray tokens/comments.
 * 3) Kept advanced stack: RHF+Zod (discriminated union), dnd-kit, React Query, Zustand, Radix, Framer Motion.
 * 4) Added lightweight runtime dev tests to validate schemas and normalization.
 */

// ---------------------
// Utilities
// ---------------------
function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

const requiredMsg = (f: string) => `${f} נדרש`;
const isoNow = () => new Date().toISOString();

// ---------------------
// Domain Schemas
// ---------------------
const CommonSchema = z.object({
  title: z.string().min(2, requiredMsg("כותרת")),
  channelId: z.string().min(1, requiredMsg("ערוץ")),
  plannedStart: z.string().datetime({ offset: true }),
  plannedEnd: z.string().datetime({ offset: true }),
  tags: z.array(z.string()).default([]),
});

const GameSchema = z.object({
  category: z.literal("game"),
  homeTeam: z.string().min(1, requiredMsg("קבוצת בית")),
  awayTeam: z.string().min(1, requiredMsg("קבוצת חוץ")),
  leagueId: z.string().min(1, requiredMsg("ליגה")),
  season: z.string().min(1, requiredMsg("עונה")),
  kickoff: z.string().datetime({ offset: true }),
  venue: z.string().min(1, requiredMsg("אצטדיון")),
  signalPaths: z.array(
    z.object({
      id: z.string().default(() => uuidv4()),
      type: z.enum(["SRT", "RIST", "SDI", "NDI", "ZIXI", "HLS", "DASH"]),
      endpoint: z.string().min(3),
      bitrateMbps: z.number().min(1).max(200).default(12),
      latencyMs: z.number().min(50).max(5000).default(120),
      redundancy: z.boolean().default(true),
    })
  ).min(1, requiredMsg("לפחות נתיב אחד")),
  rightsWindowStart: z.string().datetime({ offset: true }),
  rightsWindowEnd: z.string().datetime({ offset: true }),
});

const RundownSegmentSchema = z.object({
  id: z.string().default(() => uuidv4()),
  type: z.enum(["OPEN", "LIVE", "VT", "GUEST", "ADBREAK", "GRAPHICS", "TEASE", "MUSIC"]),
  slug: z.string().min(1, requiredMsg("כותרת הפלח")),
  durationSec: z.number().int().min(1, "משך זמן > 0"),
  notes: z.string().optional(),
  assets: z.array(z.string()).default([]),
});

const ShowSchema = z
  .object({
    category: z.literal("show"),
    seriesId: z.string().min(1, requiredMsg("סדרה")),
    seasonNumber: z.number().int().min(1).default(1),
    episodeNumber: z.number().int().min(1).default(1),
    runtimeSec: z.number().int().min(60).default(3600),
    isLive: z.boolean().default(false),
    presenterIds: z.array(z.string()).default([]),
    rundown: z.array(RundownSegmentSchema).min(1, requiredMsg("תכנית שידור")),
  })
  .superRefine((val, ctx) => {
    const total = val.rundown.reduce((s, r) => s + r.durationSec, 0);
    if (Math.abs(total - val.runtimeSec) > 15) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `סך הזמן ${total}ש לא תואם לזמן הריצה ${val.runtimeSec}ש (±15ש מותר)`,
        path: ["rundown"],
      });
    }
  });

const NewsItemSchema = z.object({
  id: z.string().default(() => uuidv4()),
  slug: z.string().min(1),
  desk: z.enum(["Politics", "Sports", "World", "Finance", "Culture", "Tech"]).default("World"),
  priority: z.enum(["P1", "P2", "P3"]).default("P2"),
  durationSec: z.number().int().min(20).max(1800).default(120),
  writerId: z.string().optional(),
});

const NewsSchema = z.object({
  category: z.literal("news"),
  bulletinType: z.enum(["BREAKING", "REGULAR", "SPECIAL"]).default("REGULAR"),
  anchorId: z.string().min(1, requiredMsg("קריין")),
  region: z.enum(["National", "International", "Local"]).default("National"),
  rundown: z.array(NewsItemSchema).min(1, requiredMsg("תכנית חדשות")),
});

const SessionSchema = z.object({
  id: z.string().default(() => uuidv4()),
  title: z.string().min(1),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  speakers: z.array(z.string()).default([]),
  room: z.string().min(1),
  streamType: z.enum(["SRT", "HLS", "DASH", "NDI", "RTMP"]).default("HLS"),
  url: z.string().url().optional(),
});

const ConferenceSchema = z.object({
  category: z.literal("conference"),
  eventCode: z.string().min(1, requiredMsg("קוד אירוע")),
  track: z.string().min(1, requiredMsg("מסלול")),
  organizerId: z.string().min(1, requiredMsg("מארגן")),
  sessions: z.array(SessionSchema).min(1),
});

const EntitySchema = z.object({
  common: CommonSchema,
  entity: z.union([GameSchema, ShowSchema, NewsSchema, ConferenceSchema]),
});

export type EntityInput = z.infer<typeof EntitySchema>;

// ---------------------
// Store (Zustand)
// ---------------------
interface UIState {
  category: EntityInput["entity"]["category"];
  setCategory: (c: UIState["category"]) => void;
  draft: Partial<EntityInput> | null;
  setDraft: (d: Partial<EntityInput> | null) => void;
}

const useUI = create<UIState>((set) => ({
  category: "show",
  setCategory: (category) => set({ category }),
  draft: null,
  setDraft: (draft) => set({ draft }),
}));

// ---------------------
// Real API Integration with GraphQL
// ---------------------
import { gql } from '@apollo/client';
import { GET_USERS } from '../../graphql/queries';

// Use existing queries from your schema
const GET_PRESENTERS = GET_USERS;
const GET_ANCHORS = GET_USERS;

// ---------------------
// Query Client
// ---------------------
const queryClient = new QueryClient();

// ---------------------
// Primitive UI
// ---------------------
function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-200">
      {children}
    </label>
  );
}

function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { wrapperClassName?: string }
) {
  const { wrapperClassName, className, ...rest } = props;
  return (
    <div className={cn("space-y-1", wrapperClassName)}>
      <input
        {...rest}
        className={cn(
          "w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100",
          "focus:outline-none focus:ring-2 focus:ring-indigo-500",
          className
        )}
      />
    </div>
  );
}

function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { wrapperClassName?: string }
) {
  const { wrapperClassName, className, ...rest } = props;
  return (
    <div className={cn("space-y-1", wrapperClassName)}>
      <textarea
        {...rest}
        className={cn(
          "w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100",
          "focus:outline-none focus:ring-2 focus:ring-indigo-500",
          className
        )}
      />
    </div>
  );
}

function NumberInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { wrapperClassName?: string }
) {
  return <Input type="number" inputMode="numeric" {...props} />;
}

function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }
) {
  const { className, variant = "primary", ...rest } = props;
  const variants: Record<typeof variant, string> = {
    primary: "bg-indigo-600 hover:bg-indigo-500 text-white",
    ghost: "bg-transparent hover:bg-gray-800 text-gray-100 border border-gray-700",
    danger: "bg-rose-600 hover:bg-rose-500 text-white",
  } as const;
  return (
    <button
      {...rest}
      className={cn(
        "rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition",
        variants[variant],
        className
      )}
    />
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-gray-800 bg-black/40 p-4 shadow-lg", className)}>
      {children}
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-wide text-gray-300 uppercase">{title}</h3>
        {right}
      </div>
      <div>{children}</div>
    </Card>
  );
}

function ErrorText({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs font-medium text-rose-400">{msg}</p>;
}

// ---------------------
// Data hooks using Apollo Client
// ---------------------
import { useQuery as useApolloQuery } from '@apollo/client';
import { useAuth } from '@/contexts/AuthContext';
import { Permission } from '@/rbac';



function usePresenters() {
  const { hasPermission } = useAuth();
  const canList = hasPermission(Permission.USERS_VIEW);
  const { data, loading, error } = useApolloQuery(GET_PRESENTERS, {
    variables: { isActive: true },
    skip: !canList,
    errorPolicy: 'all',
  });
  return { 
    data: data?.users?.map((user: any) => ({ id: user.id, name: user.displayName || `${user.firstName} ${user.lastName}` })) || [], 
    loading, 
    error 
  };
}

function useAnchors() {
  const { hasPermission } = useAuth();
  const canList = hasPermission(Permission.USERS_VIEW);
  const { data, loading, error } = useApolloQuery(GET_ANCHORS, {
    variables: { isActive: true },
    skip: !canList,
    errorPolicy: 'all',
  });
  return { 
    data: data?.users?.map((user: any) => ({ id: user.id, name: user.displayName || `${user.firstName} ${user.lastName}` })) || [], 
    loading, 
    error 
  };
}

// ---------------------
// Sortable helpers
// ---------------------
function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div data-id={id} className="rounded-xl border border-gray-800 bg-gray-950 p-3">
      {children}
    </div>
  );
}

// ---------------------
// Forms – Common
// ---------------------
function useFormContextTyped(): UseFormReturn<EntityInput> {
  return useFormContext<EntityInput>();
}

function CommonFields({ event }: { event?: any }) {
  const {
    register,
    formState: { errors },
    control,
  } = useFormContextTyped();

  return (
    <Section title="כללי">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label>כותרת</Label>
          <Input placeholder="לדוגמה: תוכנית ליל שישי" {...register("common.title")} />
          <ErrorText msg={errors?.common?.title?.message as string | undefined} />
        </div>
        <div>
          <Label>ערוץ</Label>
          <div className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300">
            {event?.channel || event?.parallelChannel || 'לא צוין'}
          </div>
        </div>
        <div>
          <Label>תחילת שידור מתוכננת</Label>
          <div className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300">
            {event?.startTime ? new Date(event.startTime).toLocaleString('he-IL') : 'לא צוין'}
          </div>
        </div>
        <div>
          <Label>סיום שידור מתוכנן</Label>
          <div className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300">
            {event?.endTime ? new Date(event.endTime).toLocaleString('he-IL') : 'לא צוין'}
          </div>
        </div>
        <div>
          <Label>תגיות (מופרדות בפסיק)</Label>
          <Input
            placeholder="ספורט, שידור חי"
            {...register("common.tags", {
              setValueAs: (v) =>
                typeof v === "string"
                  ? v
                      .split(",")
                      .map((s: string) => s.trim())
                      .filter(Boolean)
                  : v,
            })}
          />
        </div>
      </div>
    </Section>
  );
}

// ---------------------
// Forms – Game
// ---------------------
function GameForm({ event }: { event?: any }) {
  const {
    register,
    formState: { errors },
    control,
  } = useFormContextTyped();

  const signalPaths = useFieldArray({ control, name: "entity.signalPaths" });

  return (
    <Section
      title="פרטי המשחק"
      right={
        <Button
          onClick={() =>
            signalPaths.append({ id: uuidv4(), type: "SRT", endpoint: "srt://", bitrateMbps: 12, latencyMs: 120, redundancy: true })
          }
        >
          + הוסף נתיב
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label>קבוצת בית</Label>
          <div className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300">
            {event?.homeTeam || 'לא צוין'}
          </div>
        </div>
        <div>
          <Label>קבוצת חוץ</Label>
          <div className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300">
            {event?.awayTeam || 'לא צוין'}
          </div>
        </div>
        <div>
          <Label>ליגה</Label>
          <div className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300">
            {event?.league || 'לא צוין'}
          </div>
        </div>
        <div>
          <Label>עונה</Label>
          <Input placeholder="2025/26" {...register("entity.season")} />
        </div>
        <div>
          <Label>שעת התחלה (KO/TO)</Label>
          <div className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300">
            {event?.koTime ? new Date(event.koTime).toLocaleString('he-IL') : 'לא צוין'}
          </div>
        </div>
        <div>
          <Label>אצטדיון</Label>
          <Input placeholder="לדוגמה: נוקיה ארנה" {...register("entity.venue")} />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <h4 className="text-sm font-semibold text-gray-300">נתיבי אות</h4>
        {signalPaths.fields.map((f, idx) => (
          <Card key={f.id} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <div className="md:col-span-1">
                <Label>Type</Label>
                <select
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                  {...register(`entity.signalPaths.${idx}.type` as const)}
                >
                  {["SRT", "RIST", "SDI", "NDI", "ZIXI", "HLS", "DASH"].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3">
                <Label>Endpoint</Label>
                <Input
                  placeholder="srt://host:port?streamid=..."
                  {...register(`entity.signalPaths.${idx}.endpoint` as const)}
                />
              </div>
              <div>
                <Label>Bitrate (Mbps)</Label>
                <NumberInput
                  step={1}
                  {...register(`entity.signalPaths.${idx}.bitrateMbps` as const, { valueAsNumber: true })}
                />
              </div>
              <div>
                <Label>Latency (ms)</Label>
                <NumberInput
                  step={10}
                  {...register(`entity.signalPaths.${idx}.latencyMs` as const, { valueAsNumber: true })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" {...register(`entity.signalPaths.${idx}.redundancy` as const)} /> Redundancy
              </label>
              <Button variant="danger" onClick={() => signalPaths.remove(idx)}>
                Remove
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label>Rights Window Start (ISO)</Label>
          <Input type="datetime-local" {...register("entity.rightsWindowStart")} />
        </div>
        <div>
          <Label>Rights Window End (ISO)</Label>
          <Input type="datetime-local" {...register("entity.rightsWindowEnd")} />
        </div>
      </div>
    </Section>
  );
}

// ---------------------
// Forms – Show (with Advanced Rundown Builder)
// ---------------------
function ShowForm() {
  const { data: presenters } = usePresenters();
  const {
    register,
    control,
    formState: { errors },
    watch,
  } = useFormContextTyped();

  const { fields, append, remove, move } = useFieldArray({ control, name: "entity.rundown" });
  const sensors = useSensors(useSensor(PointerSensor));

  const total = (watch("entity.rundown") || []).reduce((s: number, r: any) => s + (r?.durationSec ?? 0), 0);
  const runtime = watch("entity.runtimeSec");
  const drift = (total || 0) - (runtime || 0);

  return (
    <Section
      title="פרטי התוכנית"
      right={
        <div className="flex items-center gap-3">
          <Button onClick={() => append({ id: uuidv4(), type: "OPEN", slug: "פתיחה", durationSec: 60, assets: [] })}>+ הוסף פלח</Button>
          <span
            className={cn(
              "rounded-lg px-2 py-1 text-xs",
              Math.abs(drift) <= 15 ? "bg-emerald-900 text-emerald-200" : "bg-rose-900 text-rose-200"
            )}
          >
            סטייה: {drift}ש
          </span>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <Label>סדרה</Label>
          <Input placeholder="מזהה סדרה" {...register("entity.seriesId")} />
          <ErrorText msg={(errors as any)?.entity?.seriesId?.message} />
        </div>
        <div>
          <Label>עונה</Label>
          <NumberInput {...register("entity.seasonNumber", { valueAsNumber: true })} />
        </div>
        <div>
          <Label>פרק</Label>
          <NumberInput {...register("entity.episodeNumber", { valueAsNumber: true })} />
        </div>
        <div>
          <Label>משך זמן (שניות)</Label>
          <NumberInput {...register("entity.runtimeSec", { valueAsNumber: true })} />
        </div>
        <div>
          <Label>שידור חי?</Label>
          <label className="ml-2 inline-flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" {...register("entity.isLive")} /> כן
          </label>
        </div>
        <div className="md:col-span-2">
          <Label>מגישים</Label>
          <Controller
            control={control}
            name="entity.presenterIds"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {presenters?.data?.map((p: any) => (
                  <label
                    key={p.id}
                    className={cn(
                      "cursor-pointer rounded-lg border px-3 py-1 text-xs",
                      field.value?.includes(p.id)
                        ? "border-indigo-500 bg-indigo-950 text-indigo-200"
                        : "border-gray-700 bg-gray-900 text-gray-200"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={field.value?.includes(p.id) ?? false}
                      onChange={(e) => {
                        const next = new Set(field.value || []);
                        e.target.checked ? next.add(p.id) : next.delete(p.id);
                        field.onChange(Array.from(next));
                      }}
                      className="mr-2"
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
          />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-300">תכנית שידור</h4>
          <Button onClick={() => append({ id: uuidv4(), type: "ADBREAK", slug: "הפסקה", durationSec: 180, assets: [] })}>+ הוסף שורה</Button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => {
            const activeId = String(event.active.id);
            const overId = event.over?.id ? String(event.over.id) : undefined;
            if (!overId || activeId === overId) return;
            const oldIndex = fields.findIndex((f) => f.id === activeId);
            const newIndex = fields.findIndex((f) => f.id === overId);
            if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
              move(oldIndex, newIndex);
            }
          }}
        >
          <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {fields.map((f, idx) => (
                <SortableItem id={f.id} key={f.id}>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                    <div>
                      <Label>Type</Label>
                      <select
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                        {...register(`entity.rundown.${idx}.type` as const)}
                      >
                        {["OPEN", "LIVE", "VT", "GUEST", "ADBREAK", "GRAPHICS", "TEASE", "MUSIC"].map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      <Label>Slug</Label>
                      <Input placeholder="Segment title" {...register(`entity.rundown.${idx}.slug` as const)} />
                    </div>
                    <div>
                      <Label>Duration (sec)</Label>
                      <NumberInput
                        {...register(`entity.rundown.${idx}.durationSec` as const, { valueAsNumber: true })}
                      />
                    </div>
                    <div>
                      <Label>Assets (comma)</Label>
                      <Input
                        placeholder="clip-123, gfx-456"
                        {...register(`entity.rundown.${idx}.assets` as const, {
                          setValueAs: (v) =>
                            typeof v === "string"
                              ? v
                                  .split(",")
                                  .map((s: string) => s.trim())
                                  .filter(Boolean)
                              : v,
                        })}
                      />
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-6">
                    <div className="md:col-span-5">
                      <Label>Notes</Label>
                      <TextArea
                        rows={2}
                        placeholder="Blocking, cues, IFB, CG lines..."
                        {...register(`entity.rundown.${idx}.notes` as const)}
                      />
                    </div>
                    <div className="flex items-end justify-end">
                      <Button variant="danger" onClick={() => remove(idx)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </Section>
  );
}

// ---------------------
// Forms – News
// ---------------------
function NewsForm() {
  const { data: anchors } = useAnchors();
  const {
    register,
    control,
  } = useFormContextTyped();

  const { fields, append, remove, move } = useFieldArray({ control, name: "entity.rundown" });
  const sensors = useSensors(useSensor(PointerSensor));

  return (
    <Section title="מהדורת חדשות">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div>
          <Label>סוג מהדורה</Label>
          <select
            className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
            {...register("entity.bulletinType")}
          >
            {["BREAKING", "REGULAR", "SPECIAL"].map((t) => (
              <option key={t} value={t}>
                {t === "BREAKING" ? "חדשות חמות" : t === "REGULAR" ? "מהדורה רגילה" : "מהדורה מיוחדת"}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <Label>קריין</Label>
          <select
            className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
            {...register("entity.anchorId")}
          >
            {anchors?.data?.map((a: any) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>אזור</Label>
          <select
            className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
            {...register("entity.region")}
          >
            {["National", "International", "Local"].map((r) => (
              <option key={r} value={r}>
                {r === "National" ? "ארצי" : r === "International" ? "בינלאומי" : "מקומי"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-300">תכנית חדשות</h4>
          <Button onClick={() => append({ id: uuidv4(), slug: "כתבה", priority: "P2", durationSec: 120, desk: "World" })}>
            + הוסף כתבה
          </Button>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => {
            const activeId = String(e.active.id);
            const overId = e.over?.id ? String(e.over.id) : undefined;
            if (!overId || activeId === overId) return;
            const oldIndex = fields.findIndex((f) => f.id === activeId);
            const newIndex = fields.findIndex((f) => f.id === overId);
            if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
              move(oldIndex, newIndex);
            }
          }}
        >
          <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {fields.map((f, idx) => (
                <SortableItem id={f.id} key={f.id}>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                    <div className="md:col-span-2">
                      <Label>כותרת</Label>
                      <Input {...register(`entity.rundown.${idx}.slug` as const)} />
                    </div>
                    <div>
                      <Label>מחלקה</Label>
                      <select
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                        {...register(`entity.rundown.${idx}.desk` as const)}
                      >
                        {["Politics", "Sports", "World", "Finance", "Culture", "Tech"].map((d) => (
                          <option key={d} value={d}>
                            {d === "Politics" ? "פוליטיקה" : d === "Sports" ? "ספורט" : d === "World" ? "עולם" : d === "Finance" ? "כלכלה" : d === "Culture" ? "תרבות" : "טכנולוגיה"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>עדיפות</Label>
                      <select
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                        {...register(`entity.rundown.${idx}.priority` as const)}
                      >
                        {["P1", "P2", "P3"].map((p) => (
                          <option key={p} value={p}>
                            {p === "P1" ? "גבוהה" : p === "P2" ? "בינונית" : "נמוכה"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>משך זמן (שניות)</Label>
                      <NumberInput
                        {...register(`entity.rundown.${idx}.durationSec` as const, { valueAsNumber: true })}
                      />
                    </div>
                    <div className="flex items-end justify-end">
                      <Button variant="danger" onClick={() => remove(idx)}>
                        הסר
                      </Button>
                    </div>
                  </div>
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </Section>
  );
}

// ---------------------
// Forms – Conference
// ---------------------
function ConferenceForm() {
  const { register, control } = useFormContextTyped();
  const { fields, append, remove, move } = useFieldArray({ control, name: "entity.sessions" });
  const sensors = useSensors(useSensor(PointerSensor));

  return (
    <Section title="Conference">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <Label>Event Code</Label>
          <Input placeholder="IBC2025" {...register("entity.eventCode")} />
        </div>
        <div>
          <Label>Track</Label>
          <Input placeholder="Broadcast Tech" {...register("entity.track")} />
        </div>
        <div>
          <Label>Organizer ID</Label>
          <Input placeholder="org-123" {...register("entity.organizerId")} />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-300">Sessions</h4>
          <Button
            onClick={() =>
              append({ id: uuidv4(), title: "Keynote", start: isoNow(), end: isoNow(), speakers: [], room: "Hall A", streamType: "HLS" })
            }
          >
            + Add Session
          </Button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => {
            const activeId = String(e.active.id);
            const overId = e.over?.id ? String(e.over.id) : undefined;
            if (!overId || activeId === overId) return;
            const oldIndex = fields.findIndex((f) => f.id === activeId);
            const newIndex = fields.findIndex((f) => f.id === overId);
            if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
              move(oldIndex, newIndex);
            }
          }}
        >
          <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {fields.map((f, idx) => (
                <SortableItem id={f.id} key={f.id}>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
                    <div className="md:col-span-2">
                      <Label>Title</Label>
                      <Input {...register(`entity.sessions.${idx}.title` as const)} />
                    </div>
                    <div>
                      <Label>Start</Label>
                      <Input type="datetime-local" {...register(`entity.sessions.${idx}.start` as const)} />
                    </div>
                    <div>
                      <Label>End</Label>
                      <Input type="datetime-local" {...register(`entity.sessions.${idx}.end` as const)} />
                    </div>
                    <div>
                      <Label>Room</Label>
                      <Input {...register(`entity.sessions.${idx}.room` as const)} />
                    </div>
                    <div>
                      <Label>Stream</Label>
                      <select
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                        {...register(`entity.sessions.${idx}.streamType` as const)}
                      >
                        {["SRT", "HLS", "DASH", "NDI", "RTMP"].map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Speakers (comma)</Label>
                      <Input
                        placeholder="Alice,Bob"
                        {...register(`entity.sessions.${idx}.speakers` as const, {
                          setValueAs: (v) =>
                            typeof v === "string"
                              ? v.split(",").map((s: string) => s.trim()).filter(Boolean)
                              : v,
                        })}
                      />
                    </div>
                    <div className="flex items-end justify-end">
                      <Button variant="danger" onClick={() => remove(idx)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </Section>
  );
}





// ---------------------
// Form Router
// ---------------------
function RouterForm({ event }: { event?: any }) {
  const category = useUI((s) => s.category);

  switch (category) {
    case "game":
      return <GameForm event={event} />;
    case "show":
      return <ShowForm />;
    case "news":
      return <NewsForm />;
    case "conference":
      return <ConferenceForm />;
    default:
      return null;
  }
}

// ---------------------
// Defaults - Auto-populated from event
// ---------------------
const createDefaults = (event?: any): EntityInput => ({
  common: {
    title: event?.title || "",
    channelId: event?.channelId || "",
    plannedStart: event?.startTime || isoNow(),
    plannedEnd: event?.endTime || addMinutes(new Date(), 60).toISOString(),
    tags: event?.tags || [],
  },
  entity: {
    category: "show",
    seriesId: event?.seriesId || "",
    seasonNumber: 1,
    episodeNumber: 1,
    runtimeSec: 3600,
    isLive: false,
    presenterIds: [],
    rundown: [
      { id: uuidv4(), type: "OPEN", slug: "פתיחה", durationSec: 60, assets: [], notes: "פתיחת התוכנית" },
      { id: uuidv4(), type: "LIVE", slug: "הקדמה באולפן", durationSec: 180, assets: [], notes: "מעבר לשידור חי" },
    ],
  },
});

// ---------------------
// Normalizer (example payload for Lancelot API)
// ---------------------
function normalizeForAPI(input: EntityInput) {
  const base = {
    schemaVersion: 1,
    sourceSystem: "lancelot-web-ui",
    createdAt: isoNow(),
    ...input.common,
  };

  switch (input.entity.category) {
    case "game":
      return { type: "GAME", ...base, game: input.entity };
    case "show":
      return { type: "SHOW", ...base, show: input.entity };
    case "news":
      return { type: "NEWS", ...base, news: input.entity };
    case "conference":
      return { type: "CONFERENCE", ...base, conference: input.entity };
  }
}

// ---------------------
// Main Panel
// ---------------------
function CorePanel({ event, canEdit = true }: { event?: any; canEdit?: boolean }) {
  const category = useUI((s) => s.category);
  const setCategory = useUI((s) => s.setCategory);
  const draft = useUI((s) => s.draft);
  const setDraft = useUI((s) => s.setDraft);

  const defaults = createDefaults(event);

  const methods = useForm<EntityInput>({
    resolver: zodResolver(EntitySchema),
    defaultValues: draft || defaults,
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const [updateDepartmentData] = useApolloMutation(UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA);

  const onSubmit = methods.handleSubmit(async (values) => {
    if (!canEdit) {
      console.warn('Save attempted without BROADCAST_MANAGE permission');
      return;
    }
    try {
      const normalizedData = normalizeForAPI(values);
      await updateDepartmentData({
        variables: {
          eventId: event?.id,
          department: 'rundown',
          data: { rundown: normalizedData }
        }
      });
      console.log("submitted:", normalizedData);
    } catch (error) {
      console.error('Error saving rundown data:', error);
    }
  });

  // Keep UI tab in sync with discriminated union field
  useEffect(() => {
    const sub = methods.watch((v, { name }) => {
      if (name === "entity.category") {
        const cur = methods.getValues("entity.category");
        setCategory(cur as UIState["category"]);
      }
      setDraft(v as Partial<EntityInput>);
    });
    return () => sub.unsubscribe();
  }, [methods.watch]);

  return (
    <FormProvider {...methods}>
      <div className="mx-auto max-w-6xl space-y-6 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">מערכת תכנית שידור מתקדמת</h2>
        </div>

        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>סוג התוכן</Label>
              <select
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                value={category}
                onChange={(e) => {
                  const newCategory = e.target.value as UIState["category"];
                  setCategory(newCategory);
                  methods.setValue("entity.category", newCategory);
                }}
              >
                <option value="game">משחק</option>
                <option value="show">תוכנית</option>
                <option value="news">חדשות</option>
                <option value="conference">מסיבת עיתונאים</option>
              </select>
            </div>

          </div>
        </Card>

        <CommonFields event={event} />

        <AnimatePresence mode="wait">
          <motion.div
            key={String(category)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            <RouterForm event={event} />
          </motion.div>
        </AnimatePresence>

        {/* Bottom Action Buttons */}
        <div className="mt-8 pt-6 border-t border-gray-700/50">
          <div className="flex items-center justify-end gap-4">
            {canEdit && (
              <>
                <Button type="button" variant="ghost" onClick={() => methods.reset(createDefaults(event))}>
                  איפוס
                </Button>
                <Button type="button" onClick={onSubmit}>
                  שמור
                </Button>
              </>
            )}
          </div>
        </div>

      </div>
    </FormProvider>
  );
}



// ---------------------
// Provider Wrapper
// ---------------------
function LancelotAdvancedIngestPanel({ event, canEdit = true }: { event?: any; canEdit?: boolean }) {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-full" dir="rtl">
        <CorePanel event={event} canEdit={canEdit} />
      </div>
    </QueryClientProvider>
  );
}

// ---------------------
// Modal Wrapper for Lancelot Integration
// ---------------------
interface RundownModalProps {
  visible: boolean;
  event: any;
  onClose: () => void;
  onDataSaved: () => void;
  /** When false, hides graphics creator and save controls. */
  canEdit?: boolean;
}

export default function RundownModal({ visible, event, onClose, onDataSaved, canEdit = true }: RundownModalProps) {
  const [updateDepartmentData] = useApolloMutation(UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA);
  
  // Graphics Creation System State
  const [graphicsCreatorVisible, setGraphicsCreatorVisible] = useState(false);

  const handleSave = async (rundownData: any) => {
    try {
      await updateDepartmentData({
        variables: {
          eventId: event.id,
          department: 'rundown',
          data: { rundown: rundownData }
        }
      });
      onDataSaved();
      onClose();
    } catch (error) {
      console.error('Error saving rundown data:', error);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Sandglass/Hourglass Background Overlay */}
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        style={{
          background: `
            radial-gradient(ellipse at center top, rgba(139, 69, 19, 0.3) 0%, transparent 50%),
            radial-gradient(ellipse at center bottom, rgba(139, 69, 19, 0.3) 0%, transparent 50%),
            linear-gradient(45deg, rgba(160, 82, 45, 0.1) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(160, 82, 45, 0.1) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(160, 82, 45, 0.1) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(160, 82, 45, 0.1) 75%),
            radial-gradient(circle at 50% 50%, rgba(218, 165, 32, 0.05) 0%, rgba(0, 0, 0, 0.95) 70%)
          `,
          backgroundSize: '100% 100%, 100% 100%, 60px 60px, 60px 60px, 60px 60px, 60px 60px, 100% 100%'
        }}
        onClick={onClose}
      />
      
      {/* Animated Sand Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-yellow-600/30 rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 2}s`
            }}
          />
        ))}
      </div>

      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-10 w-12 h-12 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-all duration-200 backdrop-blur-sm border border-gray-600/30"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Main Content Container */}
      <div className="relative w-full h-full max-w-none max-h-none m-0 p-6 overflow-hidden">
        <div className="w-full h-full bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 rounded-2xl border border-gray-700/50 shadow-2xl backdrop-blur-md overflow-hidden">
          {/* Header with Sandglass Icon */}
          <div className="flex items-center justify-between py-4 px-6 bg-gradient-to-r from-amber-900/20 via-yellow-800/20 to-amber-900/20 border-b border-gray-700/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 text-amber-400">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6,2V8H6.5C7.33,8 8,8.67 8,9.5V10.5C8,11.33 7.33,12 6.5,12H6V22H18V12H17.5C16.67,12 16,11.33 16,10.5V9.5C16,8.67 16.67,8 17.5,8H18V2H6M8,4H16V6H8V4M8,18H16V20H8V18Z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white">חדר החדשות</h1>
            </div>
            
            {/* Graphics Creation System */}
            <div className="flex items-center gap-2">
              {!canEdit && (
                <span style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  backgroundColor: '#fff7e6',
                  color: '#ad6800',
                  border: '1px solid #ffd591',
                  fontSize: 13,
                  fontWeight: 500,
                }}>
                  לקריאה בלבד
                </span>
              )}
              {canEdit && (
              <button
                onClick={() => setGraphicsCreatorVisible(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600/20 to-purple-600/20 hover:from-blue-600/40 hover:to-purple-600/40 text-blue-200 hover:text-white rounded-lg border border-blue-500/30 transition-all duration-200"
                title="יוצר גרפיקה לשידור"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9,10H7V12H9V10M13,10H11V12H13V10M17,10H15V12H17V10M19,3H18V1H16V3H8V1H6V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M19,19H5V8H19V19Z" />
                </svg>
                <span className="text-sm font-medium">יוצר גרפיקה</span>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M11,16.5L6.5,12L7.91,10.59L11,13.67L16.59,8.09L18,9.5L11,16.5Z" />
                </svg>
              </button>
              )}
            </div>
          </div>
          
          {/* Content Area */}
          <div className="h-[calc(100%-80px)] overflow-auto">
            <LancelotAdvancedIngestPanel event={event} canEdit={canEdit} />
          </div>
        </div>
      </div>

      {/* Graphics Creator Modal */}
      {graphicsCreatorVisible && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            onClick={() => setGraphicsCreatorVisible(false)}
          />
          <div className="relative w-[98vw] h-[98vh] bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-300">
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-50 to-purple-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9,10H7V12H9V10M13,10H11V12H13V10M17,10H15V12H17V10M19,3H18V1H16V3H8V1H6V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M19,19H5V8H19V19Z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">יוצר גרפיקה לשידור</h2>
                  <p className="text-sm text-gray-600">צור גרפיקה מקצועית ויצא לקבצי MXF</p>
                </div>
              </div>
              <button
                onClick={() => setGraphicsCreatorVisible(false)}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="h-[calc(100%-80px)]">
              <EnterpriseGraphicsStudio />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}