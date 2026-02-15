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

export interface MCREvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  broadcastType?: BroadcastType;
  isMCROnly?: boolean;
  details?: BroadcastDetails;
  _mcrEventId?: string; // Internal ID for linked MCR events
}

export interface BroadcastDetails {
  // SRT fields
  ip?: string;
  port?: string;
  passphrase?: string;
  contact?: string;
  notes?: string;
  
  // Satellite/File fields
  satelliteConfig?: string;
  fileContent?: string;
  filePath?: string;
  
  // LIVEU fields
  cameraCount?: number;
}

export interface ActivityRow {
  id: string;
  activityName: string;
  time: string;
  endTime: string;
  equipment: string;
  backup: string;
  routing: string;
  channel: string;
  broadcastType?: BroadcastType;
  notes: string;
  status: 'ready' | 'not_ready' | 'error' | 'unknown';
  isHidden?: boolean;
  isManual?: boolean;
}

export interface MCRBulletinPost {
  id: string;
  content: string;
  createdBy: string;
  createdAt: Date;
  expiryDate?: Date;
  untilNewPost?: boolean;
}

