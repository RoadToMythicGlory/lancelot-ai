import { Schema, model, Document, Types, Model } from 'mongoose';

export interface IBulletinPost extends Document {
  content: string;
  createdBy: Types.ObjectId;
  departmentId: Types.ObjectId;
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
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  departmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Department',
    required: true
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
