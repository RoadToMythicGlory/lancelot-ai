import mongoose, { Schema, Document } from 'mongoose';

export interface IWarehouseParserUnknownItem extends Document {
  _id: mongoose.Types.ObjectId;
  rawName: string;
  normalizedName: string;
  canonicalKey: string;
  quantity: number;
  importId: string;
  eventId?: string;
  pdfFileName: string;
  seenCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolution?: 'mapped' | 'ignored' | 'new_item';
  resolvedToItemId?: string;
  resolvedToAlias?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
}

const warehouseParserUnknownItemSchema = new Schema<IWarehouseParserUnknownItem>(
  {
    rawName: { type: String, required: true },
    normalizedName: { type: String, required: true, index: true },
    canonicalKey: { type: String, required: true, index: true },
    quantity: { type: Number, default: 0 },
    importId: { type: String, required: true },
    eventId: String,
    pdfFileName: { type: String, required: true },
    seenCount: { type: Number, default: 1 },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    resolution: {
      type: String,
      enum: ['mapped', 'ignored', 'new_item'],
    },
    resolvedToItemId: String,
    resolvedToAlias: String,
    resolvedAt: Date,
    resolvedBy: String,
  },
  {
    timestamps: true,
    collection: 'warehouse_parser_unknown_items',
  }
);

warehouseParserUnknownItemSchema.index({ normalizedName: 1 });
warehouseParserUnknownItemSchema.index({ canonicalKey: 1 });
warehouseParserUnknownItemSchema.index({ seenCount: -1 });

export const WarehouseParserUnknownItem = mongoose.model<IWarehouseParserUnknownItem>(
  'WarehouseParserUnknownItem',
  warehouseParserUnknownItemSchema
);
