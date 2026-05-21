export type BroadcastType =
  | 'SRT_CALLER'
  | 'SRT_LISTENER'
  | 'DVBS2'
  | 'DVBS2X'
  | 'NS3'
  | 'NS4'
  | 'RTMP'
  | 'ZIXI'
  | 'PRT'
  | 'LIVEU'
  | 'KLITA_MOU'
  | 'OTHER';

export type MCRPreparationStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';

export type MCRPlatformStatus = 'PENDING' | 'CONFIRMED' | 'LIVE' | 'OFF';

export type MCRExchangeStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'ACTIVE'
  | 'REVIEW_PENDING'
  | 'CLOSED';

export interface BroadcastDetails {
  ip?: string;
  port?: string;
  passphrase?: string;
  contact?: string;
  notes?: string;
  satelliteConfig?: string;
  fileContent?: string;
  filePath?: string;
  cameraCount?: number;
}

export interface MCRFeed {
  id?: string;
  name?: string;
  satellite?: string;
  frequency?: string;
  symbolRate?: string;
  polarization?: string;
  fec?: string;
  encryptionType?: string;
  encryptionKey?: string;
  bissKey?: string;
  format?: string;
  notes?: string;
}

export interface MCRContact {
  id?: string;
  fullName?: string;
  role?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface MCROutputPlatform {
  id?: string;
  name?: string;
  outputType?: string;
  status?: MCRPlatformStatus;
  details?: string;
}

export interface MCRSharedEngineeringEquipment {
  assignmentId: string;
  equipmentId: string;
  equipmentName: string;
  barcode?: string | null;
  category?: string | null;
  quantity: number;
  status: string;
  assignedAt?: string | null;
  returnedAt?: string | null;
  assignedByName?: string | null;
  notes?: string | null;
}

export interface MCREvent {
  id: string;
  title: string;
  start: Date | string;
  end: Date | string;
  broadcastType?: BroadcastType;
  isMCROnly?: boolean;
  details?: BroadcastDetails;
  preparationStatus: MCRPreparationStatus;
  controlStudio?: string;
  broadcastChannel?: string;
  mcrStartTime?: string | null;
  mcrEndTime?: string | null;
  preparationNotes?: string;
  sourceLabel?: string;
  feeds: MCRFeed[];
  contacts: MCRContact[];
  outputPlatforms: MCROutputPlatform[];
  exchangeGroupIds: string[];
  sharedEngineeringEquipment?: MCRSharedEngineeringEquipment[];
  broadcastEventId?: string | null;
  createdBy?: { id: string; displayName: string } | null;
  createdAt?: string;
  updatedAt?: string;
  _mcrEventId?: string;
}

export interface MCRSharedEngineeringEventAssignment extends MCRSharedEngineeringEquipment {
  broadcastEventId: string;
  broadcastEventTitle?: string | null;
  broadcastEventStart?: string | null;
  broadcastEventEnd?: string | null;
  // Venue / location of the broadcast event (used by the warehouse page
  // to surface the physical location for external broadcasts).
  broadcastEventVenue?: string | null;
  broadcastEventLocation?: string | null;
  mcrEventId?: string | null;
  mcrEventTitle?: string | null;
  mcrEventStart?: string | null;
  mcrEventEnd?: string | null;
}

export interface MCRSharedEngineeringStaffAssignment {
  assignmentId: string;
  equipmentId: string;
  equipmentName: string;
  barcode?: string | null;
  category?: string | null;
  quantity: number;
  status: string;
  assignedToType: string;
  assignedToUserId?: string | null;
  assignedToName: string;
  assignedToPhone?: string | null;
  assignedAt?: string | null;
  assignedByName?: string | null;
  returnedAt?: string | null;
  notes?: string | null;
}

export interface MCRSharedEngineeringWarehouseEquipment {
  equipmentId: string;
  equipmentName: string;
  barcode?: string | null;
  category?: string | null;
  quantity: number;
  status: 'warehouse' | string;
  // Structured warehouse location, used by the warehouse-side tab to
  // render the elaborated "במחסן ראשי – מדף 4" label. Optional so it
  // stays backward-compatible with MCR consumers.
  warehouseId?: string | null;
  warehouseName?: string | null;
  storagePlaceId?: string | null;
  storagePlaceName?: string | null;
  storagePlaceCode?: string | null;
  currentLocation?: string | null;
}

export interface MCRSharedEngineeringTracking {
  eventAssignments: MCRSharedEngineeringEventAssignment[];
  staffAssignments: MCRSharedEngineeringStaffAssignment[];
  availableEquipment: MCRSharedEngineeringWarehouseEquipment[];
}

export type ActivityStatus = 'READY' | 'NOT_READY' | 'ERROR' | 'UNKNOWN';

export interface WarehouseEquipmentAssignment {
  id: string;
  equipmentId: string;
  eventName: string;
  eventId: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  status: string;
  quantityAssigned: number;
  assignmentStatus: string;
  assignedToName?: string;
  assignedBy?: string;
  assignmentNotes?: string;
}

export interface ActivityRow {
  id: string;
  date?: string;
  activityName: string;
  source?: string;
  time: string;
  endTime: string;
  equipment?: string;
  backup?: string;
  routing?: string;
  channel?: string;
  broadcastType?: BroadcastType;
  notes?: string;
  status: ActivityStatus;
  isHidden?: boolean;
  isManual?: boolean;
  broadcastEventId?: string;
  warehouseEquipment?: WarehouseEquipmentAssignment[];
  createdBy?: { id: string; displayName: string };
  updatedBy?: { id: string; displayName: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface MCRBulletinPost {
  id: string;
  content: string;
  createdBy: { id: string; displayName: string } | string;
  createdAt: Date | string;
  expiryDate?: Date | string;
  untilNewPost?: boolean;
}

export interface MCRDailyCheckTemplate {
  id: string;
  name: string;
  description?: string;
  order: number;
  isActive: boolean;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface MCRDailyCheckEntry {
  id: string;
  date: string;
  template: MCRDailyCheckTemplate;
  isCompleted: boolean;
  completedBy?: { id: string; displayName: string } | null;
  completedAt?: string | null;
  notes?: string;
}

export interface MCRDailyCheckSummary {
  date: string;
  total: number;
  completed: number;
  percentage: number;
  entries: MCRDailyCheckEntry[];
}

export interface MCRExchangeUpload {
  id: string;
  fileName: string;
  uploadedByName?: string;
  uploadedByEmail?: string;
  synopsisTitle?: string;
  notes?: string;
  isAccepted: boolean;
  acceptedAt?: string | null;
  createdAt?: string;
}

export interface MCRExchangeGroup {
  id: string;
  name: string;
  description?: string;
  status: MCRExchangeStatus;
  takerCount: number;
  synopsisCount: number;
  pendingUploads: MCRExchangeUpload[];
  linkedMcrEventIds: string[];
  createdBy?: { id: string; displayName: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MCRDocumentFeedSuggestion {
  name?: string;
  satellite?: string;
  frequency?: string;
  symbolRate?: string;
  polarization?: string;
  fec?: string;
  encryptionType?: string;
  encryptionKey?: string;
  bissKey?: string;
  format?: string;
  notes?: string;
}

export interface MCRDocumentPlatformSuggestion {
  name?: string;
  outputType?: string;
  status?: MCRPlatformStatus;
  details?: string;
}

export interface MCRDocumentParseResult {
  feeds: MCRDocumentFeedSuggestion[];
  platforms: MCRDocumentPlatformSuggestion[];
  itemCount: number;
}

export type CalendarRangeMode = 'day' | 'week' | 'month';
