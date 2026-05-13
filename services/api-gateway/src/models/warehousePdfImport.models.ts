import mongoose, { Schema, Document } from 'mongoose';

export interface IWarehousePdfImport extends Document {
  _id: mongoose.Types.ObjectId;
  importId: string;
  eventId?: string;
  uploadedFileName: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: Date;
  parserVersion: string;
  parserProfile?: string;
  parsedItemCount: number;
  matchedItemCount: number;
  unmatchedItemCount: number;
  warnings: string[];
  status: 'draft' | 'committed' | 'abandoned' | 'failed';
  errorMessage?: string;
  committedAt?: Date;
  rawPdfPath?: string;
  documentConfidence?: number;
  importContentHash?: string;
  inventoryHash?: string;
  inventoryItemCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

const warehousePdfImportSchema = new Schema<IWarehousePdfImport>(
  {
    importId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    eventId: {
      type: String,
      index: true,
    },
    uploadedFileName: {
      type: String,
      required: true,
    },
    uploadedBy: String,
    uploadedByName: String,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    parserVersion: {
      type: String,
      required: true,
    },
    parserProfile: String,
    parsedItemCount: { type: Number, default: 0 },
    matchedItemCount: { type: Number, default: 0 },
    unmatchedItemCount: { type: Number, default: 0 },
    warnings: [String],
    status: {
      type: String,
      enum: ['draft', 'committed', 'abandoned', 'failed'],
      default: 'draft',
    },
    errorMessage: String,
    committedAt: Date,
    rawPdfPath: String,
    documentConfidence: Number,
    importContentHash: { type: String, index: true },
    inventoryHash: String,
    inventoryItemCount: Number,
  },
  {
    timestamps: true,
    collection: 'warehouse_pdf_imports',
  }
);

warehousePdfImportSchema.index({ status: 1, uploadedAt: 1 });
warehousePdfImportSchema.index({ eventId: 1, importContentHash: 1 });

export const WarehousePdfImport = mongoose.model<IWarehousePdfImport>(
  'WarehousePdfImport',
  warehousePdfImportSchema
);
