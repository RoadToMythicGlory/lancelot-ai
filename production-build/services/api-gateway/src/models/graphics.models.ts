import mongoose, { Schema, Document } from 'mongoose';

export enum GraphicsElementType {
  TEXT = 'TEXT',
  RECTANGLE = 'RECTANGLE',
  IMAGE = 'IMAGE',
  LOGO = 'LOGO',
  SHAPE = 'SHAPE'
}

export enum ExportStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export enum ExportFormat {
  MXF = 'MXF',
  MOV = 'MOV',
  MP4 = 'MP4',
  PNG = 'PNG',
  TIFF = 'TIFF'
}

export enum ExportCodec {
  DNXHD = 'DNXHD',
  PRORES = 'PRORES',
  H264 = 'H264',
  UNCOMPRESSED = 'UNCOMPRESSED'
}

export interface IGraphicsElement {
  id: string;
  type: GraphicsElementType;
  content?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  opacity?: number;
  rotation?: number;
  shadow?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  animation?: string;
  animationDuration?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  gradient?: boolean;
  gradientColors?: string[];
  maxWidth?: number;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  imageUrl?: string;
  maskPath?: string;
  blendMode?: string;
  filters?: Record<string, any>;
  zIndex?: number;
}

export interface IGraphicsProject extends Document {
  name: string;
  description?: string;
  template: string;
  elements: IGraphicsElement[];
  width: number;
  height: number;
  duration: number;
  framerate: number;
  backgroundColor: string;
  assets: string[]; // Asset IDs
  tags: string[];
  isPublic: boolean;
  version: number;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IExportOptions {
  format: ExportFormat;
  codec: ExportCodec;
  resolution: string; // e.g., '1920x1080', '3840x2160'
  framerate: number;
  duration: number;
  transparency: boolean;
  quality: number; // 1-100
  bitrate?: number;
  audioTrack?: boolean;
  customSettings?: Record<string, any>;
}

export interface IGraphicsExport extends Document {
  projectId: mongoose.Types.ObjectId;
  name: string;
  status: ExportStatus;
  progress: number;
  options: IExportOptions;
  outputPath?: string;
  fileName?: string;
  fileSize?: number;
  downloadUrl?: string;
  error?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  completedAt?: Date;
}

export interface IGraphicsAsset extends Document {
  name: string;
  description?: string;
  type: 'IMAGE' | 'FONT' | 'LOGO' | 'TEMPLATE' | 'AUDIO';
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  dimensions?: { width: number; height: number };
  metadata?: Record<string, any>;
  tags: string[];
  isPublic: boolean;
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Schema Definitions
const GraphicsElementSchema = new Schema<IGraphicsElement>({
  id: { type: String, required: true },
  type: { 
    type: String, 
    enum: Object.values(GraphicsElementType),
    required: true 
  },
  content: String,
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  width: Number,
  height: Number,
  fontSize: Number,
  fontFamily: String,
  color: String,
  backgroundColor: String,
  opacity: { type: Number, min: 0, max: 1, default: 1 },
  rotation: { type: Number, default: 0 },
  shadow: { type: Boolean, default: false },
  shadowColor: String,
  shadowBlur: Number,
  shadowOffsetX: Number,
  shadowOffsetY: Number,
  animation: String,
  animationDuration: Number,
  borderRadius: Number,
  borderWidth: Number,
  borderColor: String,
  gradient: { type: Boolean, default: false },
  gradientColors: [String],
  maxWidth: Number,
  textAlign: { 
    type: String, 
    enum: ['left', 'center', 'right'],
    default: 'left' 
  },
  verticalAlign: { 
    type: String, 
    enum: ['top', 'middle', 'bottom'],
    default: 'top' 
  },
  imageUrl: String,
  maskPath: String,
  blendMode: String,
  filters: Schema.Types.Mixed,
  zIndex: { type: Number, default: 0 }
}, { _id: false });

const ExportOptionsSchema = new Schema<IExportOptions>({
  format: { 
    type: String, 
    enum: Object.values(ExportFormat),
    required: true 
  },
  codec: { 
    type: String, 
    enum: Object.values(ExportCodec),
    required: true 
  },
  resolution: { type: String, required: true },
  framerate: { type: Number, required: true },
  duration: { type: Number, required: true },
  transparency: { type: Boolean, default: false },
  quality: { type: Number, min: 1, max: 100, default: 85 },
  bitrate: Number,
  audioTrack: { type: Boolean, default: false },
  customSettings: Schema.Types.Mixed
}, { _id: false });

const GraphicsProjectSchema = new Schema<IGraphicsProject>({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  template: { type: String, required: true },
  elements: [GraphicsElementSchema],
  width: { type: Number, required: true, min: 100 },
  height: { type: Number, required: true, min: 100 },
  duration: { type: Number, required: true, min: 1 },
  framerate: { type: Number, required: true, default: 25 },
  backgroundColor: { type: String, default: '#000000' },
  assets: [{ type: Schema.Types.ObjectId, ref: 'GraphicsAsset' }],
  tags: [String],
  isPublic: { type: Boolean, default: false },
  version: { type: Number, default: 1 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const GraphicsExportSchema = new Schema<IGraphicsExport>({
  projectId: { type: Schema.Types.ObjectId, ref: 'GraphicsProject', required: true },
  name: { type: String, required: true },
  status: { 
    type: String, 
    enum: Object.values(ExportStatus),
    default: ExportStatus.PENDING 
  },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  options: { type: ExportOptionsSchema, required: true },
  outputPath: String,
  fileName: String,
  fileSize: Number,
  downloadUrl: String,
  error: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  completedAt: Date
});

const GraphicsAssetSchema = new Schema<IGraphicsAsset>({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  type: { 
    type: String, 
    enum: ['IMAGE', 'FONT', 'LOGO', 'TEMPLATE', 'AUDIO'],
    required: true 
  },
  fileName: { type: String, required: true },
  filePath: { type: String, required: true },
  fileSize: { type: Number, required: true },
  mimeType: { type: String, required: true },
  dimensions: {
    width: Number,
    height: Number
  },
  metadata: Schema.Types.Mixed,
  tags: [String],
  isPublic: { type: Boolean, default: false },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
GraphicsProjectSchema.index({ createdBy: 1, createdAt: -1 });
GraphicsProjectSchema.index({ template: 1 });
GraphicsProjectSchema.index({ tags: 1 });
GraphicsProjectSchema.index({ isPublic: 1 });

GraphicsExportSchema.index({ projectId: 1 });
GraphicsExportSchema.index({ createdBy: 1, createdAt: -1 });
GraphicsExportSchema.index({ status: 1 });

GraphicsAssetSchema.index({ type: 1 });
GraphicsAssetSchema.index({ uploadedBy: 1 });
GraphicsAssetSchema.index({ tags: 1 });
GraphicsAssetSchema.index({ isPublic: 1 });

// Middleware
GraphicsProjectSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
    this.version += 1;
  }
  next();
});

GraphicsAssetSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

export const GraphicsProject = mongoose.model<IGraphicsProject>('GraphicsProject', GraphicsProjectSchema);
export const GraphicsExport = mongoose.model<IGraphicsExport>('GraphicsExport', GraphicsExportSchema);
export const GraphicsAsset = mongoose.model<IGraphicsAsset>('GraphicsAsset', GraphicsAssetSchema);
