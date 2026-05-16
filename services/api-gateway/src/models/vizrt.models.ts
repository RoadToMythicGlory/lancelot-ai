import mongoose, { Schema, Document } from 'mongoose';

export enum VizrtMode {
  ARC = 'ARC',
  PDS = 'PDS',
  ENGINE = 'ENGINE'
}

export enum VizrtTemplateCategory {
  LOWER_THIRD = 'LOWER_THIRD',
  SCORE_BUG = 'SCORE_BUG',
  BREAKING_NEWS = 'BREAKING_NEWS',
  WEATHER = 'WEATHER',
  SPORTS_TICKER = 'SPORTS_TICKER',
  ELECTION_RESULTS = 'ELECTION_RESULTS',
  CUSTOM = 'CUSTOM'
}

export enum VizrtFieldType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  SELECT = 'SELECT',
  COLOR = 'COLOR',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO'
}

export interface IVizrtTemplateField {
  key: string;
  label: string;
  type: VizrtFieldType;
  required: boolean;
  defaultValue?: string;
  options?: string[];
}

export interface IVizrtTemplate extends Document {
  name: string;
  description?: string;
  category: VizrtTemplateCategory;
  fields: IVizrtTemplateField[];
  previewUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IVizrtConfig extends Document {
  name: string;
  mode: VizrtMode;
  baseUrl: string;
  apiKey?: string;
  headers?: string; // JSON string
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VizrtTemplateFieldSchema = new Schema<IVizrtTemplateField>({
  key: { type: String, required: true },
  label: { type: String, required: true },
  type: { 
    type: String, 
    enum: Object.values(VizrtFieldType),
    required: true 
  },
  required: { type: Boolean, required: true },
  defaultValue: { type: String },
  options: [{ type: String }]
}, { _id: false });

const VizrtTemplateSchema = new Schema<IVizrtTemplate>({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  category: { 
    type: String, 
    enum: Object.values(VizrtTemplateCategory),
    required: true 
  },
  fields: [VizrtTemplateFieldSchema],
  previewUrl: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const VizrtConfigSchema = new Schema<IVizrtConfig>({
  name: { type: String, required: true },
  mode: { 
    type: String, 
    enum: Object.values(VizrtMode),
    required: true 
  },
  baseUrl: { type: String, required: true },
  apiKey: { type: String },
  headers: { type: String }, // JSON string
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
VizrtTemplateSchema.index({ category: 1, name: 1 });
VizrtTemplateSchema.index({ category: 1 });
VizrtConfigSchema.index({ isActive: 1 });
VizrtConfigSchema.index({ name: 1 });
VizrtConfigSchema.index({ mode: 1, isActive: 1 });

export const VizrtTemplate = mongoose.model<IVizrtTemplate>('VizrtTemplate', VizrtTemplateSchema);
export const VizrtConfig = mongoose.model<IVizrtConfig>('VizrtConfig', VizrtConfigSchema);
