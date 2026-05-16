import { Schema, model, Document, Types } from 'mongoose';

export type ExchangeStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'ACTIVE'
  | 'REVIEW_PENDING'
  | 'CLOSED';

export interface IMCRExchangeUpload {
  _id?: Types.ObjectId | string;
  fileName: string;
  uploadedByName?: string;
  uploadedByEmail?: string;
  synopsisTitle?: string;
  notes?: string;
  isAccepted: boolean;
  acceptedAt?: Date;
  acceptedBy?: Types.ObjectId;
  createdAt?: Date;
}

export interface IMCRExchangeGroup extends Document {
  name: string;
  description?: string;
  status: ExchangeStatus;
  takerCount: number;
  synopsisCount: number;
  pendingUploads: IMCRExchangeUpload[];
  linkedMcrEventIds: Types.ObjectId[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const uploadSchema = new Schema<IMCRExchangeUpload>({
  fileName: { type: String, required: true, trim: true },
  uploadedByName: { type: String, trim: true },
  uploadedByEmail: { type: String, trim: true },
  synopsisTitle: { type: String, trim: true },
  notes: { type: String },
  isAccepted: { type: Boolean, default: false },
  acceptedAt: { type: Date },
  acceptedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { _id: true, timestamps: { createdAt: true, updatedAt: false } });

const exchangeGroupSchema = new Schema<IMCRExchangeGroup>({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  status: {
    type: String,
    enum: ['DRAFT', 'PUBLISHED', 'ACTIVE', 'REVIEW_PENDING', 'CLOSED'],
    default: 'DRAFT',
    required: true,
  },
  takerCount: { type: Number, default: 0 },
  synopsisCount: { type: Number, default: 0 },
  pendingUploads: { type: [uploadSchema], default: [] },
  linkedMcrEventIds: [{ type: Schema.Types.ObjectId, ref: 'MCREvent' }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

exchangeGroupSchema.index({ status: 1, createdAt: -1 });
exchangeGroupSchema.index({ linkedMcrEventIds: 1 });
exchangeGroupSchema.index({ createdBy: 1 });

export const MCRExchangeGroup = model<IMCRExchangeGroup>(
  'MCRExchangeGroup',
  exchangeGroupSchema,
);

export default MCRExchangeGroup;
