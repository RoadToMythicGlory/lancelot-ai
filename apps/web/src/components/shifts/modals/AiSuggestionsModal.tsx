'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Input, Button, Spin, Empty, Tag, Tooltip, message } from 'antd';
import { gql, useLazyQuery, useMutation } from '@apollo/client';
import dayjs from 'dayjs';
import { SparklesIcon } from '@heroicons/react/24/outline';

const AI_SUGGEST = gql`
  query AiScheduleSuggest($input: AiScheduleSuggestInput!) {
    aiScheduleSuggest(input: $input) {
      shiftTypeId
      shiftTypeName
      aplId
      aplName
      date
      userId
      userDisplayName
      startTime
      endTime
      reason
    }
  }
`;

const APPLY_SUGGESTIONS = gql`
  mutation ApplyAiSuggestions($input: ApplyAiSuggestionsInput!) {
    applyAiSuggestions(input: $input)
  }
`;

interface AiSuggestionsModalProps {
  open: boolean;
  onClose: () => void;
  departmentId: string;
  weekStart: string; // YYYY-MM-DD (Sunday)
  weekEnd: string;   // YYYY-MM-DD (Saturday)
  onApplied?: () => void;
}

interface Suggestion {
  shiftTypeId: string;
  shiftTypeName: string;
  aplId: string;
  aplName: string;
  date: string;
  userId: string;
  userDisplayName: string;
  startTime: string;
  endTime: string;
  reason: string;
}

export default function AiSuggestionsModal({
  open,
  onClose,
  departmentId,
  weekStart,
  weekEnd,
  onApplied,
}: AiSuggestionsModalProps) {
  const [prompt, setPrompt] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [run, { data, loading }] = useLazyQuery(AI_SUGGEST, {
    fetchPolicy: 'no-cache',
  });
  const [apply, { loading: applying }] = useMutation(APPLY_SUGGESTIONS);

  useEffect(() => {
    if (open && departmentId) {
      run({
        variables: {
          input: { departmentId, weekStart, weekEnd, userPrompt: prompt || null },
        },
      });
    }
    if (!open) {
      setSelected(new Set());
      setPrompt('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, departmentId, weekStart, weekEnd]);

  const suggestions: Suggestion[] = data?.aiScheduleSuggest || [];
  const keyOf = (s: Suggestion) => `${s.date}|${s.shiftTypeId}|${s.aplId}`;

  function toggle(s: Suggestion) {
    const k = keyOf(s);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(suggestions.map(keyOf)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function handleApply() {
    const chosen = suggestions.filter((s) => selected.has(keyOf(s)));
    if (chosen.length === 0) {
      message.warning('בחר לפחות הצעה אחת');
      return;
    }
    try {
      const { data: applyData } = await apply({
        variables: {
          input: {
            departmentId,
            suggestions: chosen.map((s) => ({
              shiftTypeId: s.shiftTypeId,
              aplId: s.aplId,
              date: s.date,
              userId: s.userId,
              startTime: s.startTime,
              endTime: s.endTime,
            })),
          },
        },
      });
      const count = applyData?.applyAiSuggestions ?? chosen.length;
      message.success(`יושמו ${count} שיבוצים`);
      onApplied?.();
      onClose();
    } catch (e: any) {
      message.error(e?.message || 'שגיאה בהחלת ההצעות');
    }
  }

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-5 w-5 text-violet-600" />
          <span>הצעות שיבוץ אוטומטיות</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="cancel" onClick={onClose}>
          ביטול
        </Button>,
        <Button key="all" onClick={selectAll}>
          בחר הכל
        </Button>,
        <Button key="clear" onClick={clearSelection}>
          נקה
        </Button>,
        <Button
          key="apply"
          type="primary"
          loading={applying}
          onClick={handleApply}
          disabled={selected.size === 0}
        >
          החל ({selected.size})
        </Button>,
      ]}
      destroyOnHidden
    >
      <div className="space-y-3">
        <div>
          <label className="text-sm text-gray-700">הנחיה למערכת (אופציונלי):</label>
          <Input.TextArea
            rows={2}
            placeholder='לדוגמה: "תעדף עובדים מסוימים", "פחות סופ״ש לעובדים חדשים"…'
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="text-left mt-2">
            <Button
              size="small"
              loading={loading}
              onClick={() =>
                run({
                  variables: {
                    input: {
                      departmentId,
                      weekStart,
                      weekEnd,
                      userPrompt: prompt || null,
                    },
                  },
                })
              }
            >
              חשב מחדש
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : suggestions.length === 0 ? (
          <Empty description="לא נמצאו הצעות לשיבוץ" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
            {suggestions.map((s) => {
              const isSelected = selected.has(keyOf(s));
              return (
                <div
                  key={keyOf(s)}
                  onClick={() => toggle(s)}
                  className={`border rounded-md p-3 cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-violet-400 bg-violet-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-gray-800">{s.userDisplayName}</span>
                      <span className="text-gray-500 mr-2">
                        {dayjs(s.date).format('dddd DD/MM')}
                      </span>
                    </div>
                    <Tag color="blue">{s.shiftTypeName}</Tag>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                    <Tag color="purple">{s.aplName}</Tag>
                    <span>
                      {s.startTime} – {s.endTime}
                    </span>
                  </div>
                  {s.reason && (
                    <Tooltip title={s.reason}>
                      <div className="text-[11px] text-gray-400 mt-1 truncate">
                        {s.reason}
                      </div>
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
