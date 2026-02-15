import mongoose from 'mongoose';
import { Equipment } from '../models/equipment.models';

async function resetEquipmentStatuses() {
  try {
    // Connect to MongoDB
    const mongoUrl = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/broadcast';
    await mongoose.connect(mongoUrl);
    console.log('✅ Connected to MongoDB');

    // Find all equipment
    const allEquipment = await Equipment.find({});
    console.log(`📦 Found ${allEquipment.length} equipment items to reset`);

    let updatedCount = 0;
    for (const equipment of allEquipment) {
      // Reset status to available
      equipment.status = 'available';
      
      // Reset quantities - make all quantity available
      equipment.quantityAvailable = equipment.quantityTotal;
      equipment.quantityAssigned = 0;
      
      // Clear current location if it was set to an event
      if (equipment.currentLocation && equipment.currentLocation.includes('אירוע')) {
        equipment.currentLocation = equipment.storage ? 
          `${equipment.storage.row || ''} ${equipment.storage.shelf || ''} ${equipment.storage.cell || ''}`.trim() : 
          undefined;
      }
      
      await equipment.save();
      updatedCount++;
      console.log(`✅ Reset: ${equipment.name} (${equipment.barcode}) - Status: available, Available: ${equipment.quantityAvailable}/${equipment.quantityTotal}`);
    }

    console.log(`\n✅ Successfully reset ${updatedCount} equipment items`);
    console.log('All equipment statuses have been reset to "available"');
    console.log('All quantities have been reset (Available = Total, Assigned = 0)');

  } catch (error) {
    console.error('❌ Error resetting equipment statuses:', error);
  } finally {
    process.exit(0);
  }
}

// Run the script
resetEquipmentStatuses(); 