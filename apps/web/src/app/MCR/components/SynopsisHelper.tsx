'use client';

import React, { useState } from 'react';
import {
  App,
  Button,
  Checkbox,
  Collapse,
  Empty,
  Modal,
  Tabs,
  Upload,
  message as antMessage,
  Tag,
} from 'antd';
import {
  CheckCircleOutlined,
  FileSearchOutlined,
  InboxOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import { useMutation } from '@apollo/client';
import { PARSE_MCR_DOCUMENT } from '@/graphql/mcrMutations';
import type {
  MCRDocumentFeedSuggestion,
  MCRDocumentPlatformSuggestion,
  MCRPlatformStatus,
} from '../types';
import { PLATFORM_STATUS_LABELS, PLATFORM_STATUS_COLORS } from '../constants';
import StatusChip from './StatusChip';

interface Props {
  open: boolean;
  onClose: () => void;
  canManage: boolean;
  onApply: (selected: {
    feeds: MCRDocumentFeedSuggestion[];
    platforms: MCRDocumentPlatformSuggestion[];
  }) => void;
}

interface ParseState {
  fileName: string;
  feeds: MCRDocumentFeedSuggestion[];
  platforms: MCRDocumentPlatformSuggestion[];
}

const ACCEPT =
  '.txt,.pdf,.csv,.xls,.xlsx,.doc,.docx,text/plain,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Reads a file as plain UTF-8 text. PDFs and binary office docs are still
 * parsed via the same path — pdf/docx will arrive as binary blobs and the
 * heuristic parser handles whatever extractable text the browser produces.
 */
async function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const SynopsisHelper: React.FC<Props> = ({ open, onClose, canManage, onApply }) => {
  const { message } = App.useApp();
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParseState | null>(null);
  const [selectedFeeds, setSelectedFeeds] = useState<Record<number, boolean>>({});
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<number, boolean>>({});

  const [parseMutation] = useMutation(PARSE_MCR_DOCUMENT);

  const reset = () => {
    setParsed(null);
    setSelectedFeeds({});
    setSelectedPlatforms({});
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const content = await readFileText(file);
      const { data } = await parseMutation({
        variables: {
          input: {
            fileName: file.name,
            fileType: file.type || file.name.split('.').pop() || 'text/plain',
            content,
            lookFor: ['FEED', 'PLATFORM'],
          },
        },
      });
      const result = data?.parseMCRDocument;
      const feeds: MCRDocumentFeedSuggestion[] = result?.feeds || [];
      const platforms: MCRDocumentPlatformSuggestion[] = result?.platforms || [];
      setParsed({ fileName: file.name, feeds, platforms });
      // Pre-select everything found so a single click adds all suggestions.
      setSelectedFeeds(Object.fromEntries(feeds.map((_, i) => [i, true])));
      setSelectedPlatforms(Object.fromEntries(platforms.map((_, i) => [i, true])));
      if (feeds.length + platforms.length === 0) {
        antMessage.info('לא נמצאו פריטים בקובץ');
      } else {
        antMessage.success(`נמצאו ${feeds.length + platforms.length} פריטים`);
      }
    } catch (err: any) {
      message.error('ניתוח הקובץ נכשל: ' + (err?.message || 'שגיאה לא ידועה'));
    } finally {
      setParsing(false);
    }
  };

  const apply = () => {
    if (!parsed) return;
    const feeds = parsed.feeds.filter((_, i) => selectedFeeds[i]);
    const platforms = parsed.platforms.filter((_, i) => selectedPlatforms[i]);
    onApply({ feeds, platforms });
    reset();
  };

  const totalSelected =
    Object.values(selectedFeeds).filter(Boolean).length +
    Object.values(selectedPlatforms).filter(Boolean).length;

  return (
    <Modal
      open={open}
      onCancel={() => {
        reset();
        onClose();
      }}
      title="ייבוא ממסמך סינופסיס"
      width={780}
      footer={
        parsed ? (
          [
            <Button key="retry" icon={<RedoOutlined />} onClick={reset}>
              נסה קובץ אחר
            </Button>,
            <Button key="cancel" onClick={() => { reset(); onClose(); }}>
              ביטול
            </Button>,
            <Button
              key="apply"
              type="primary"
              icon={<CheckCircleOutlined />}
              disabled={!canManage || totalSelected === 0}
              onClick={apply}
            >
              הוסף לאירוע ({totalSelected})
            </Button>,
          ]
        ) : (
          <Button onClick={() => { reset(); onClose(); }}>ביטול</Button>
        )
      }
    >
      {!parsed && (
        <Upload.Dragger
          name="synopsis"
          multiple={false}
          accept={ACCEPT}
          showUploadList={false}
          disabled={!canManage}
          beforeUpload={(file) => {
            handleFile(file as File);
            return false;
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">גרור קובץ סינופסיס לכאן או לחץ לבחירה</p>
          <p className="ant-upload-hint">
            נתמכים: TXT, CSV, PDF, Word, Excel. המסמך מנותח ומחזיר הצעות לקליטות
            ופלטפורמות יציאה לעריכה לפני שיוכנסו לאירוע.
          </p>
        </Upload.Dragger>
      )}

      {parsing && (
        <div className="text-center py-6 text-slate-500">
          <FileSearchOutlined spin /> מנתח את הקובץ...
        </div>
      )}

      {parsed && (
        <div className="flex flex-col gap-3">
          <div className="text-sm text-slate-600">
            קובץ: <strong>{parsed.fileName}</strong> · נמצאו {parsed.feeds.length} קליטות ו-
            {parsed.platforms.length} פלטפורמות
          </div>
          <Tabs
            items={[
              {
                key: 'feeds',
                label: `קליטות (${parsed.feeds.length})`,
                children: parsed.feeds.length === 0 ? (
                  <Empty description="לא נמצאו קליטות" />
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Button
                        size="small"
                        onClick={() =>
                          setSelectedFeeds(
                            Object.fromEntries(parsed.feeds.map((_, i) => [i, true])),
                          )
                        }
                      >
                        בחר הכל
                      </Button>
                      <Button size="small" onClick={() => setSelectedFeeds({})}>
                        נקה בחירה
                      </Button>
                    </div>
                    <Collapse
                      items={parsed.feeds.map((feed, i) => ({
                        key: String(i),
                        label: (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={!!selectedFeeds[i]}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                setSelectedFeeds((p) => ({ ...p, [i]: e.target.checked }))
                              }
                            />
                            <span className="font-semibold">
                              {feed.name || feed.satellite || `קליטה ${i + 1}`}
                            </span>
                          </div>
                        ),
                        children: (
                          <div className="text-sm grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1">
                            {feed.satellite && <span>לוויין: {feed.satellite}</span>}
                            {feed.frequency && <span>תדר: {feed.frequency}</span>}
                            {feed.symbolRate && <span>SR: {feed.symbolRate}</span>}
                            {feed.polarization && <span>קוטביות: {feed.polarization}</span>}
                            {feed.fec && <span>FEC: {feed.fec}</span>}
                            {feed.format && <span>פורמט: {feed.format}</span>}
                            {feed.encryptionType && <span>הצפנה: {feed.encryptionType}</span>}
                            {feed.bissKey && <span>BISS Key: ••••</span>}
                          </div>
                        ),
                      }))}
                    />
                  </div>
                ),
              },
              {
                key: 'platforms',
                label: `פלטפורמות (${parsed.platforms.length})`,
                children: parsed.platforms.length === 0 ? (
                  <Empty description="לא נמצאו פלטפורמות" />
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Button
                        size="small"
                        onClick={() =>
                          setSelectedPlatforms(
                            Object.fromEntries(parsed.platforms.map((_, i) => [i, true])),
                          )
                        }
                      >
                        בחר הכל
                      </Button>
                      <Button size="small" onClick={() => setSelectedPlatforms({})}>
                        נקה בחירה
                      </Button>
                    </div>
                    <Collapse
                      items={parsed.platforms.map((p, i) => ({
                        key: String(i),
                        label: (
                          <div className="flex items-center gap-2 justify-between w-full">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={!!selectedPlatforms[i]}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  setSelectedPlatforms((s) => ({
                                    ...s,
                                    [i]: e.target.checked,
                                  }))
                                }
                              />
                              <span className="font-semibold">
                                {p.name || `פלטפורמה ${i + 1}`}
                              </span>
                            </div>
                            {p.status && (
                              <StatusChip
                                size="sm"
                                label={PLATFORM_STATUS_LABELS[p.status as MCRPlatformStatus]}
                                color={
                                  PLATFORM_STATUS_COLORS[p.status as MCRPlatformStatus]
                                }
                              />
                            )}
                          </div>
                        ),
                        children: (
                          <div className="text-sm flex flex-col gap-1">
                            {p.outputType && (
                              <span>
                                סוג: <Tag>{p.outputType}</Tag>
                              </span>
                            )}
                            {p.details && <div className="text-slate-600">{p.details}</div>}
                          </div>
                        ),
                      }))}
                    />
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}
    </Modal>
  );
};

export default SynopsisHelper;
