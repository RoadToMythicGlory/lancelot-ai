'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useMutation, useQuery } from '@apollo/client';
import { App, Button, Spin, Tooltip } from 'antd';
import {
  DownloadOutlined,
  ReloadOutlined,
  ArrowLeftOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from '@ant-design/icons';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import {
  CREATE_FLIGHT_BOARD,
  DELETE_FLIGHT_BOARD,
  GET_FLIGHT_BOARDS,
  GET_FLIGHT_BOARD_DATA,
  UPDATE_FLIGHT_BOARD,
} from '@/graphql/flightBoardQueries';
import { BoardSelector } from './components/BoardSelector';
import { BoardGallery } from './components/BoardGallery';
import { RangeControls } from './components/RangeControls';
import { PanelContainer } from './components/PanelContainer';
import { BoardBuilder } from './components/BoardBuilder';
import { EditPanelDrawer } from './components/EditPanelDrawer';
import { exportBoardCsv } from './utils/export';
import type {
  FlightBoard,
  FlightBoardData,
  FlightBoardPanel,
  FlightBoardRange,
} from './types';
import './styles/flight-board.css';

interface FlightBoardPageInnerProps {
  /**
   * When set, the page locks itself to a single board identified by
   * `pinnedBoard.matchTitle`. If no board with that title exists yet and
   * the user has manage permission, it will be auto-created from
   * `pinnedBoard.initialBoardInput`. The board selector is hidden and
   * users can't switch to other boards from this view — used by purpose-
   * built pages like the MCR Flight Board.
   */
  pinnedBoard?: {
    matchTitle: string;
    pageTitle?: string;
    pageSubtitle?: string;
    initialBoardInput: any;
  };
}

export function FlightBoardPageInner({ pinnedBoard }: FlightBoardPageInnerProps = {}) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(Permission.FLIGHT_BOARD_MANAGE);
  const { message, modal } = App.useApp();

  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [bootstrappingPinned, setBootstrappingPinned] = useState(false);
  const [range, setRange] = useState<FlightBoardRange>({ preset: 'TODAY' });
  const [expandedPanelId, setExpandedPanelId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderTarget, setBuilderTarget] = useState<FlightBoard | null>(null);
  const [editPanelTarget, setEditPanelTarget] = useState<FlightBoardPanel | null>(null);
  const [kiosk, setKiosk] = useState(false);
  const pageRef = React.useRef<HTMLDivElement>(null);

  // Keep `kiosk` in sync with the browser's native fullscreen state so the
  // user pressing Esc properly exits kiosk mode and any single-panel expand.
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) {
        setKiosk(false);
        setExpandedPanelId(null);
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Esc as a manual escape hatch when Fullscreen API isn't available.
  useEffect(() => {
    if (!kiosk) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) {
        setKiosk(false);
        setExpandedPanelId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [kiosk]);

  const enterKiosk = async () => {
    const el = pageRef.current;
    if (!el) return;
    setKiosk(true);
    try {
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch {
      // Fullscreen API may be blocked; the kiosk class still hides chrome.
    }
  };

  const exitKiosk = async () => {
    setKiosk(false);
    setExpandedPanelId(null);
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      /* noop */
    }
  };

  const toggleKiosk = async () => {
    if (!kiosk) await enterKiosk();
    else await exitKiosk();
  };

  // "הצג מורחב" reuses the kiosk layout for a single panel: enter kiosk and
  // pin the panel id so the grid filters down to just that one. Toggling it
  // off exits kiosk too, so users get one consistent immersive view.
  const handleTogglePanelExpand = async (panelId: string) => {
    if (expandedPanelId === panelId) {
      await exitKiosk();
      return;
    }
    setExpandedPanelId(panelId);
    if (!kiosk) await enterKiosk();
  };

  const {
    data: boardsData,
    loading: boardsLoading,
    refetch: refetchBoards,
  } = useQuery<{ flightBoards: FlightBoard[] }>(GET_FLIGHT_BOARDS, {
    fetchPolicy: 'cache-and-network',
  });

  const boards = useMemo(
    () => boardsData?.flightBoards || [],
    [boardsData?.flightBoards],
  );
  const selectedBoard = useMemo(
    () => boards.find((b) => b.id === selectedBoardId) || null,
    [boards, selectedBoardId],
  );

  const [createBoard, { loading: creating }] = useMutation(CREATE_FLIGHT_BOARD, {
    refetchQueries: [{ query: GET_FLIGHT_BOARDS }],
  });
  const [updateBoard, { loading: updating }] = useMutation(UPDATE_FLIGHT_BOARD, {
    refetchQueries: [{ query: GET_FLIGHT_BOARDS }],
  });
  const [deleteBoard] = useMutation(DELETE_FLIGHT_BOARD, {
    refetchQueries: [{ query: GET_FLIGHT_BOARDS }],
  });

  // Auto-select default board (or first board) when boards load.
  useEffect(() => {
    if (selectedBoardId) return;
    if (boardsLoading) return;

    if (pinnedBoard) {
      // Locked to a single board. Look it up by title; if missing, fall
      // through to the bootstrap effect below (which can auto-create it).
      const match = boards.find((b) => b.title === pinnedBoard.matchTitle);
      if (match) {
        setSelectedBoardId(match.id);
      }
      return;
    }

    if (boards.length === 0) return;
    const def = boards.find((b) => b.isDefault);
    setSelectedBoardId(def ? def.id : boards[0].id);
  }, [boards, selectedBoardId, boardsLoading, pinnedBoard]);

  // Auto-create the pinned board on first visit when it doesn't exist
  // yet. Only attempted for users with manage permission — viewers see
  // the empty-state notice below instead.
  useEffect(() => {
    if (!pinnedBoard) return;
    if (selectedBoardId) return;
    if (boardsLoading) return;
    if (bootstrappingPinned) return;
    if (!canManage) return;
    const match = boards.find((b) => b.title === pinnedBoard.matchTitle);
    if (match) return;

    let cancelled = false;
    setBootstrappingPinned(true);
    (async () => {
      try {
        const res = await createBoard({ variables: { input: pinnedBoard.initialBoardInput } });
        const newId = res.data?.createFlightBoard?.id;
        if (!cancelled && newId) {
          setSelectedBoardId(newId);
        }
      } catch (err: any) {
        if (!cancelled) {
          message.error(err?.message || 'שגיאה ביצירת לוח MCR');
        }
      } finally {
        if (!cancelled) setBootstrappingPinned(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedBoard, boards, boardsLoading, selectedBoardId, canManage]);

  const refreshIntervalSec = selectedBoard?.refreshIntervalSec || 60;

  const dataQuery = useQuery<{ flightBoardData: FlightBoardData }>(GET_FLIGHT_BOARD_DATA, {
    skip: !selectedBoardId,
    variables: {
      boardId: selectedBoardId,
      range: {
        preset: range.preset,
        start: range.start,
        end: range.end,
      },
    },
    pollInterval: selectedBoardId ? refreshIntervalSec * 1000 : 0,
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
  });

  const items = dataQuery.data?.flightBoardData?.items || [];
  const overlay = dataQuery.data?.flightBoardData?.overlay || null;

  const handleSelectBoard = (id: string | null) => {
    setSelectedBoardId(id);
    setExpandedPanelId(null);
  };

  const handleCreate = () => {
    if (!canManage) {
      message.error('אין לך הרשאה לערוך לוחות טיסה');
      return;
    }

    setBuilderTarget(null);
    setBuilderOpen(true);
  };

  const handleEdit = () => {
    if (!canManage) {
      message.error('אין לך הרשאה לערוך לוחות טיסה');
      return;
    }

    if (!selectedBoard) return;
    setBuilderTarget(selectedBoard);
    setBuilderOpen(true);
  };

  const handleDelete = () => {
    if (!canManage) {
      message.error('אין לך הרשאה למחוק לוחות טיסה');
      return;
    }

    if (!selectedBoard) return;
    modal.confirm({
      title: 'מחיקת לוח',
      content: `המחיקה אינה ניתנת לשחזור. האם למחוק את הלוח "${selectedBoard.title}"?`,
      okText: 'מחק',
      okType: 'danger',
      cancelText: 'ביטול',
      onOk: async () => {
        try {
          await deleteBoard({ variables: { id: selectedBoard.id } });
          message.success('הלוח נמחק');
          setSelectedBoardId(null);
        } catch (err: any) {
          message.error(err?.message || 'שגיאה במחיקה');
        }
      },
    });
  };

  const handleSubmitBuilder = async (input: any) => {
    if (!canManage) {
      message.error('אין לך הרשאה לערוך לוחות טיסה');
      return;
    }

    try {
      if (builderTarget) {
        const res = await updateBoard({
          variables: { id: builderTarget.id, input },
        });
        message.success('הלוח עודכן');
        setSelectedBoardId(res.data?.updateFlightBoard?.id || builderTarget.id);
      } else {
        const res = await createBoard({ variables: { input } });
        message.success('הלוח נוצר');
        const newId = res.data?.createFlightBoard?.id;
        if (newId) setSelectedBoardId(newId);
      }
      setBuilderOpen(false);
      setBuilderTarget(null);
    } catch (err: any) {
      message.error(err?.message || 'שגיאה בשמירה');
    }
  };

  const handleExport = () => {
    if (!selectedBoard) return;
    if (items.length === 0) {
      message.info('אין נתונים לייצוא');
      return;
    }
    exportBoardCsv(selectedBoard.title, items);
  };

  const renderPanels = () => {
    if (!selectedBoard) return null;
    if (selectedBoard.panels.length === 0) {
      return (
        <div className="flight-board-empty" style={{ minHeight: 240 }}>
          ללוח זה אין פאנלים עדיין
        </div>
      );
    }
    const panels = expandedPanelId
      ? selectedBoard.panels.filter((p) => p.id === expandedPanelId)
      : [...selectedBoard.panels].sort((a, b) => a.order - b.order);

    return (
      <div className="flight-board-grid">
        {panels.map((panel) => (
          <PanelContainer
            key={panel.id}
            panel={panel}
            items={items}
            loading={dataQuery.loading || dataQuery.networkStatus === 4}
            expanded={expandedPanelId === panel.id}
            onToggleExpand={() => handleTogglePanelExpand(panel.id)}
            canEdit={canManage}
            onEdit={() => setEditPanelTarget(panel)}
          />
        ))}
      </div>
    );
  };

  return (
    <div
      ref={pageRef}
      className={`flight-board-page ${kiosk ? 'is-kiosk' : ''}`}
      dir="rtl"
    >
      <div className="flight-board-shell">
        <header className="flight-board-header">
          <div className="flight-board-title">
            <h1>{pinnedBoard?.pageTitle || 'לוח טיסות'}</h1>
            <span className="subtitle">
              {pinnedBoard?.pageSubtitle || 'תפעול בזמן אמת'}
            </span>
            <span className="flight-board-live-dot">LIVE</span>
          </div>
          <div className="flight-board-actions">
            {!pinnedBoard && (
              <BoardSelector
                boards={boards}
                selectedId={selectedBoardId}
                canManage={canManage}
                onSelect={handleSelectBoard}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onCreate={handleCreate}
              />
            )}
            {pinnedBoard && canManage && selectedBoard && (
              <Button onClick={handleEdit}>ערוך לוח</Button>
            )}
            <Tooltip title="רענון ידני">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  refetchBoards();
                  if (selectedBoardId) dataQuery.refetch();
                }}
              >
                רענן
              </Button>
            </Tooltip>
            <Tooltip title="ייצוא ל-CSV">
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExport}
                disabled={!selectedBoard}
              >
                ייצא
              </Button>
            </Tooltip>
            <Tooltip title={kiosk ? 'יציאה ממסך מלא (Esc)' : 'תצוגת מסך מלא'}>
              <Button
                icon={kiosk ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={toggleKiosk}
              >
                {kiosk ? 'יציאה ממסך מלא' : 'מסך מלא'}
              </Button>
            </Tooltip>
            {selectedBoard && !pinnedBoard && (
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={() => setSelectedBoardId(null)}
                style={{ color: '#94a3b8' }}
              >
                לכל הלוחות
              </Button>
            )}
          </div>
          {selectedBoard && (
            <div className="flight-board-controls">
              <RangeControls range={range} onChange={setRange} />
            </div>
          )}
        </header>

        {boardsLoading && !boards.length ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : bootstrappingPinned ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spin size="large" tip="יוצר לוח MCR…" />
          </div>
        ) : !selectedBoard && pinnedBoard ? (
          <div className="flight-board-empty" style={{ minHeight: 240 }}>
            לוח ה-MCR טרם נוצר.
            {canManage
              ? ' מנהל יכול ליצור אותו לחיצה אחת – נסה לרענן.'
              : ' פנה למנהל המערכת.'}
          </div>
        ) : !selectedBoard ? (
          <BoardGallery
            boards={boards}
            canManage={canManage}
            onSelect={handleSelectBoard}
            onCreate={handleCreate}
          />
        ) : (
          renderPanels()
        )}

        <footer className="flight-board-logo-footer" aria-label="Lancelot">
          <Image
            src="/lancelot-white-logo.png"
            alt="Lancelot"
            width={180}
            height={55}
            className="flight-board-footer-logo"
            unoptimized
          />
        </footer>
      </div>

      {kiosk && (
        <Tooltip title="יציאה ממסך מלא (Esc)" placement="bottomRight">
          <button
            type="button"
            className="flight-board-kiosk-exit"
            onClick={toggleKiosk}
            aria-label="יציאה ממסך מלא"
          >
            <FullscreenExitOutlined />
          </button>
        </Tooltip>
      )}

      <BoardBuilder
        open={builderOpen}
        initial={builderTarget}
        saving={creating || updating}
        onClose={() => {
          setBuilderOpen(false);
          setBuilderTarget(null);
        }}
        onSubmit={handleSubmitBuilder}
      />

      {selectedBoard && (
        <EditPanelDrawer
          open={!!editPanelTarget}
          onClose={() => setEditPanelTarget(null)}
          boardId={selectedBoard.id}
          panel={editPanelTarget}
          items={items}
          overlay={overlay}
          range={range}
        />
      )}
    </div>
  );
}

export default function FlightBoardPage() {
  return (
    <ProtectedRoute requires={Permission.FLIGHT_BOARD_VIEW}>
      <FlightBoardPageInner />
    </ProtectedRoute>
  );
}
