import mongoose, { Schema, Document } from 'mongoose';

// Interface for TypeScript
export interface IVendor extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  hebrewName?: string;
  category?: 'equipment' | 'services' | 'both';
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  alternateContactName?: string;
  alternateContactPhone?: string;
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  website?: string;
  notes?: string;
  isActive: boolean;
  
  // System fields
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// MongoDB Schema
const vendorSchema = new Schema<IVendor>({
  name: { 
    type: String, 
    required: true,
    unique: true,
    index: true 
  },
  hebrewName: String,
  category: { 
    type: String, 
    enum: ['equipment', 'services', 'both']
  },
  contactName: String,
  contactPhone: String,
  contactEmail: {
    type: String,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  alternateContactName: String,
  alternateContactPhone: String,
  address: {
    street: String,
    city: String,
    postalCode: String,
    country: { type: String, default: 'Israel' }
  },
  website: {
    type: String,
    match: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/
  },
  notes: String,
  isActive: { 
    type: Boolean, 
    default: true 
  },
  
  // System fields
  createdBy: String
}, {
  timestamps: true,
  collection: 'vendors'
});

// Indexes for performance
vendorSchema.index({ name: 'text', hebrewName: 'text' });
vendorSchema.index({ category: 1, isActive: 1 });

// Export the model
export const Vendor = mongoose.model<IVendor>('Vendor', vendorSchema);
