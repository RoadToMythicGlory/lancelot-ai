import { Schema, model, Document, Types, Model } from 'mongoose';

export interface IBulletinPost extends Document {
  content: string;
  // Dashboard board fields. Optional so MCR's bulletin (which only uses
  // `content`) keeps working. The home page's "Bulletin Board" uses all
  // of them.
  title?: string;
  isEmergency?: boolean;
  isPinned?: boolean;
  tags?: string[];
  viewCount?: number;
  createdBy: Types.ObjectId;
  departmentId?: Types.ObjectId | null;
  expiryDate?: Date;
  untilNewPost?: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const bulletinPostSchema = new Schema<IBulletinPost>({
  content: {
    type: String,
    required: true
  },
  title: { type: String },
  isEmergency: { type: Boolean, default: false },
  isPinned: { type: Boolean, default: false },
  tags: { type: [String], default: [] },
  viewCount: { type: Number, default: 0 },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  departmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Department',
    // Org-wide announcements (the dashboard board's default) have no
    // department, so this is intentionally optional.
    required: false,
    default: null,
  },
  expiryDate: {
    type: Date
  },
  untilNewPost: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
bulletinPostSchema.index({ departmentId: 1, isActive: 1 });
bulletinPostSchema.index({ expiryDate: 1 });
bulletinPostSchema.index({ createdBy: 1 });
bulletinPostSchema.index({ departmentId: 1, isActive: 1, createdAt: -1 });
bulletinPostSchema.index({ isActive: 1, expiryDate: 1 });
bulletinPostSchema.index({ departmentId: 1, untilNewPost: 1, isActive: 1 });

// Virtual to check if post is currently active
bulletinPostSchema.virtual('isCurrentlyActive').get(function() {
  if (!this.isActive) return false;
  if (this.untilNewPost) return true;
  if (this.expiryDate) {
    return new Date() < this.expiryDate;
  }
  return true;
});

// Method to deactivate posts marked as "until new post"
bulletinPostSchema.statics.deactivateUntilNewPosts = async function(departmentId: Types.ObjectId) {
  await this.updateMany(
    { 
      departmentId, 
      untilNewPost: true,
      isActive: true
    },
    { 
      isActive: false 
    }
  );
};

// Add interface for static methods
export interface IBulletinPostModel extends Model<IBulletinPost> {
  deactivateUntilNewPosts(departmentId: Types.ObjectId): Promise<void>;
}

const BulletinPost = model<IBulletinPost, IBulletinPostModel>('BulletinPost', bulletinPostSchema);

export default BulletinPost;
