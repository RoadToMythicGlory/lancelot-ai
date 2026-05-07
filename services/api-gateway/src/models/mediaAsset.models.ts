import mongoose, { Schema, Document } from 'mongoose';

// ==================== MEDIA ASSET MANAGEMENT (DAM) ====================

export interface IMediaAsset extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  
  // File info
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number; // bytes
  filePath: string;
  cdnUrl?: string;
  thumbnailUrl?: string;
  
  // Classification
  type: 'video' | 'audio' | 'image' | 'document' | 'graphic' | 'other';
  category?: string;
  
  // Metadata
  title: string;
  titleHe?: string;
  description?: string;
  tags: string[];
  
  // Media-specific metadata
  duration?: number; // seconds (for video/audio)
  width?: number; // pixels (for video/image)
  height?: number; // pixels (for video/image)
  codec?: string;
  bitrate?: number;
  frameRate?: number;
  
  // Rights & licensing
  rightsHolder?: string;
  licenseType?: string;
  licenseExpiresAt?: Date;
  usageRestrictions?: string;
  territories?: string[]; // Countries where usage is allowed
  
  // Versioning
  version: number;
  parentAssetId?: mongoose.Types.ObjectId; // Reference to original version
  
  // Relations
  linkedBroadcastEvents?: string[];
  linkedMCREvents?: string[];
  
  // Status
  status: 'uploading' | 'processing' | 'ready' | 'archived' | 'deleted';
  isPublic: boolean;
  
  // Audit
  uploadedBy: string;
  uploadedByName?: string;
  lastModifiedBy?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface IMediaFolder extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  name: string;
  nameHe?: string;
  parentFolderId?: mongoose.Types.ObjectId;
  path: string; // Full path like "/Sports/Football/2026"
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const mediaAssetSchema = new Schema<IMediaAsset>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  
  filename: { type: String, required: true },
  originalFilename: { type: String, required: true },
  mimeType: { type: String, required: true },
  fileSize: { type: Number, required: true },
  filePath: { type: String, required: true },
  cdnUrl: String,
  thumbnailUrl: String,
  
  type: {
    type: String,
    enum: ['video', 'audio', 'image', 'document', 'graphic', 'other'],
    required: true
  },
  category: String,
  
  title: { type: String, required: true },
  titleHe: String,
  description: String,
  tags: [{ type: String }],
  
  duration: Number,
  width: Number,
  height: Number,
  codec: String,
  bitrate: Number,
  frameRate: Number,
  
  rightsHolder: String,
  licenseType: String,
  licenseExpiresAt: Date,
  usageRestrictions: String,
  territories: [String],
  
  version: { type: Number, default: 1 },
  parentAssetId: { type: Schema.Types.ObjectId, ref: 'MediaAsset' },
  
  linkedBroadcastEvents: [String],
  linkedMCREvents: [String],
  
  status: {
    type: String,
    enum: ['uploading', 'processing', 'ready', 'archived', 'deleted'],
    default: 'uploading'
  },
  isPublic: { type: Boolean, default: false },
  
  uploadedBy: { type: String, required: true },
  uploadedByName: String,
  lastModifiedBy: String,
}, {
  timestamps: true,
});

const mediaFolderSchema = new Schema<IMediaFolder>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  name: { type: String, required: true },
  nameHe: String,
  parentFolderId: { type: Schema.Types.ObjectId, ref: 'MediaFolder' },
  path: { type: String, required: true },
  createdBy: { type: String, required: true },
}, {
  timestamps: true,
});

// Indexes
mediaAssetSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
mediaAssetSchema.index({ organizationId: 1, type: 1 });
mediaAssetSchema.index({ tags: 1 });
mediaAssetSchema.index({ title: 'text', description: 'text', tags: 'text' });
mediaAssetSchema.index({ licenseExpiresAt: 1 });
mediaAssetSchema.index({ linkedBroadcastEvents: 1 });

mediaFolderSchema.index({ organizationId: 1, parentFolderId: 1 });
mediaFolderSchema.index({ path: 1 });

export const MediaAsset = mongoose.model<IMediaAsset>('MediaAsset', mediaAssetSchema);
export const MediaFolder = mongoose.model<IMediaFolder>('MediaFolder', mediaFolderSchema);
