import mongoose from 'mongoose';
import { Vendor } from '../models/vendor.models';
import { connectMongoose } from '../config/mongodb';
import { requireAuth, requirePermission } from '../middleware/auth';
import { Permission } from '../rbac';

// Hard cap on the vendor list query.
const MAX_VENDOR_LIST = 1000;

let mongooseConnected = false;

// Ensure MongoDB connection is established
async function ensureMongoConnection() {
  if (!mongooseConnected) {
    await connectMongoose();
    mongooseConnected = true;
  }
}

export const vendorResolvers = {
  Query: {
    vendors: async (_: any, { filter }: { filter?: any }, context: any) => {
      try {
        await ensureMongoConnection();
        requirePermission(context, Permission.WAREHOUSE_VIEW);
        
        // Build query filter
        const query: any = {};
        
        if (filter) {
          if (filter.category) {
            query.category = filter.category;
          }
          if (filter.isActive !== undefined) {
            query.isActive = filter.isActive;
          }
          if (filter.searchText) {
            query.$or = [
              { name: { $regex: filter.searchText, $options: 'i' } },
              { hebrewName: { $regex: filter.searchText, $options: 'i' } },
              { contactName: { $regex: filter.searchText, $options: 'i' } }
            ];
          }
        }
        
        const vendors = await Vendor.find(query).sort({ name: 1 }).limit(MAX_VENDOR_LIST).exec();
        
        // Map to GraphQL format
        return vendors.map(vendor => ({
          id: vendor._id.toString(),
          name: vendor.name,
          hebrewName: vendor.hebrewName || null,
          category: vendor.category || null,
          contactName: vendor.contactName || null,
          contactPhone: vendor.contactPhone || null,
          contactEmail: vendor.contactEmail || null,
          alternateContactName: vendor.alternateContactName || null,
          alternateContactPhone: vendor.alternateContactPhone || null,
          address: vendor.address || null,
          website: vendor.website || null,
          notes: vendor.notes || null,
          isActive: vendor.isActive,
          createdBy: vendor.createdBy ? { id: vendor.createdBy } : null,
          createdAt: vendor.createdAt.toISOString(),
          updatedAt: vendor.updatedAt.toISOString()
        }));
      } catch (error) {
        console.error('Error fetching vendors:', error);
        throw new Error('Failed to fetch vendors');
      }
    },
    
    vendor: async (_: any, { id }: { id: string }, context: any) => {
      try {
        await ensureMongoConnection();
        requirePermission(context, Permission.WAREHOUSE_VIEW);

        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new Error('Invalid vendor ID');
        }

        const vendor = await Vendor.findById(id).exec();
        
        if (!vendor) {
          throw new Error('Vendor not found');
        }
        
        return {
          id: vendor._id.toString(),
          name: vendor.name,
          hebrewName: vendor.hebrewName || null,
          category: vendor.category || null,
          contactName: vendor.contactName || null,
          contactPhone: vendor.contactPhone || null,
          contactEmail: vendor.contactEmail || null,
          alternateContactName: vendor.alternateContactName || null,
          alternateContactPhone: vendor.alternateContactPhone || null,
          address: vendor.address || null,
          website: vendor.website || null,
          notes: vendor.notes || null,
          isActive: vendor.isActive,
          createdBy: vendor.createdBy ? { id: vendor.createdBy } : null,
          createdAt: vendor.createdAt.toISOString(),
          updatedAt: vendor.updatedAt.toISOString()
        };
      } catch (error) {
        console.error('Error fetching vendor:', error);
        throw new Error('Failed to fetch vendor');
      }
    }
  },
  
  Mutation: {
    createVendor: async (_: any, { input }: { input: any }, context: any) => {
      try {
        await ensureMongoConnection();
        const user = requirePermission(context, Permission.WAREHOUSE_MANAGE);
        
        // Check if user has permission (must be department admin)
        if (user.systemRole !== 'SYSTEM_ADMIN' && user.systemRole !== 'DEPARTMENT_ADMIN') {
          throw new Error('Unauthorized: Only Department Admins can create vendors');
        }
        
        const vendor = new Vendor({
          ...input,
          createdBy: user.userId
        });
        
        const savedVendor = await vendor.save();
        
        return {
          id: savedVendor._id.toString(),
          name: savedVendor.name,
          hebrewName: savedVendor.hebrewName || null,
          category: savedVendor.category,
          contactName: savedVendor.contactName,
          contactPhone: savedVendor.contactPhone,
          contactEmail: savedVendor.contactEmail || null,
          alternateContactName: savedVendor.alternateContactName || null,
          alternateContactPhone: savedVendor.alternateContactPhone || null,
          address: savedVendor.address,
          website: savedVendor.website || null,
          notes: savedVendor.notes || null,
          isActive: savedVendor.isActive,
          createdBy: { id: savedVendor.createdBy },
          createdAt: savedVendor.createdAt.toISOString(),
          updatedAt: savedVendor.updatedAt.toISOString()
        };
      } catch (error) {
        console.error('Error creating vendor:', error);
        throw new Error('Failed to create vendor');
      }
    },
    
    updateVendor: async (_: any, { id, input }: { id: string; input: any }, context: any) => {
      try {
        await ensureMongoConnection();
        const user = requirePermission(context, Permission.WAREHOUSE_MANAGE);

        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new Error('Invalid vendor ID');
        }

        // Check if user has permission (must be department admin)
        if (user.systemRole !== 'SYSTEM_ADMIN' && user.systemRole !== 'DEPARTMENT_ADMIN') {
          throw new Error('Unauthorized: Only Department Admins can update vendors');
        }
        
        const vendor = await Vendor.findByIdAndUpdate(
          id,
          { ...input, updatedAt: new Date() },
          { new: true }
        ).exec();
        
        if (!vendor) {
          throw new Error('Vendor not found');
        }
        
        return {
          id: vendor._id.toString(),
          name: vendor.name,
          hebrewName: vendor.hebrewName || null,
          category: vendor.category || null,
          contactName: vendor.contactName || null,
          contactPhone: vendor.contactPhone || null,
          contactEmail: vendor.contactEmail || null,
          alternateContactName: vendor.alternateContactName || null,
          alternateContactPhone: vendor.alternateContactPhone || null,
          address: vendor.address || null,
          website: vendor.website || null,
          notes: vendor.notes || null,
          isActive: vendor.isActive,
          createdBy: vendor.createdBy ? { id: vendor.createdBy } : null,
          createdAt: vendor.createdAt.toISOString(),
          updatedAt: vendor.updatedAt.toISOString()
        };
      } catch (error) {
        console.error('Error updating vendor:', error);
        throw new Error('Failed to update vendor');
      }
    },
    
    deleteVendor: async (_: any, { id }: { id: string }, context: any) => {
      try {
        await ensureMongoConnection();
        const user = requirePermission(context, Permission.WAREHOUSE_MANAGE);

        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new Error('Invalid vendor ID');
        }

        // Check if user has permission (must be department admin)
        if (user.systemRole !== 'SYSTEM_ADMIN' && user.systemRole !== 'DEPARTMENT_ADMIN') {
          throw new Error('Unauthorized: Only Department Admins can delete vendors');
        }
        
        const vendor = await Vendor.findByIdAndDelete(id).exec();
        
        if (!vendor) {
          throw new Error('Vendor not found');
        }
        
        return true;
      } catch (error) {
        console.error('Error deleting vendor:', error);
        throw new Error('Failed to delete vendor');
      }
    },
    
    toggleVendorStatus: async (_: any, { id }: { id: string }, context: any) => {
      try {
        await ensureMongoConnection();
        const user = requirePermission(context, Permission.WAREHOUSE_MANAGE);

        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new Error('Invalid vendor ID');
        }

        // Check if user has permission (must be department admin)
        if (user.systemRole !== 'SYSTEM_ADMIN' && user.systemRole !== 'DEPARTMENT_ADMIN') {
          throw new Error('Unauthorized: Only Department Admins can toggle vendor status');
        }
        
        const vendor = await Vendor.findById(id).exec();
        
        if (!vendor) {
          throw new Error('Vendor not found');
        }
        
        vendor.isActive = !vendor.isActive;
        const updatedVendor = await vendor.save();
        
        return {
          id: updatedVendor._id.toString(),
          name: updatedVendor.name,
          hebrewName: updatedVendor.hebrewName || null,
          category: updatedVendor.category,
          contactName: updatedVendor.contactName,
          contactPhone: updatedVendor.contactPhone,
          contactEmail: updatedVendor.contactEmail || null,
          alternateContactName: updatedVendor.alternateContactName || null,
          alternateContactPhone: updatedVendor.alternateContactPhone || null,
          address: updatedVendor.address,
          website: updatedVendor.website || null,
          notes: updatedVendor.notes || null,
          isActive: updatedVendor.isActive,
          createdBy: updatedVendor.createdBy ? { id: updatedVendor.createdBy } : null,
          createdAt: updatedVendor.createdAt.toISOString(),
          updatedAt: updatedVendor.updatedAt.toISOString()
        };
      } catch (error) {
        console.error('Error toggling vendor status:', error);
        throw new Error('Failed to toggle vendor status');
      }
    }
  }
};
