import { connectMongoose } from '../config/mongodb';
import { Equipment, generateBarcode, EQUIPMENT_CATEGORIES } from '../models/equipment.models';
import mongoose from 'mongoose';

// Sample equipment data
const sampleEquipment = [
  // Cameras
  {
    name: 'Sony FX6 Cinema Camera',
    category: 'cameras',
    company: 'Sony',
    equipmentModel: 'FX6',
    quantityTotal: 5,
    price: 6000,
    contactPerson: 'יוסי כהן',
    storage: { row: 'A', shelf: '1', cell: '01' }
  },
  {
    name: 'Canon C300 Mark III',
    category: 'cameras',
    company: 'Canon',
    equipmentModel: 'C300 Mark III',
    quantityTotal: 3,
    price: 10000,
    contactPerson: 'דני לוי',
    storage: { row: 'A', shelf: '1', cell: '02' }
  },
  {
    name: 'Blackmagic URSA Mini Pro 12K',
    category: 'cameras',
    company: 'Blackmagic Design',
    equipmentModel: 'URSA Mini Pro 12K',
    quantityTotal: 2,
    price: 9995,
    contactPerson: 'מירי כהן',
    storage: { row: 'A', shelf: '1', cell: '03' }
  },

  // Batteries
  {
    name: 'V-Mount Battery 190Wh',
    category: 'batteries',
    company: 'Anton Bauer',
    equipmentModel: 'Dionic XT',
    quantityTotal: 20,
    price: 350,
    contactPerson: 'אבי גולן',
    storage: { row: 'B', shelf: '1', cell: '01' }
  },
  {
    name: 'Gold Mount Battery 150Wh',
    category: 'batteries',
    company: 'IDX',
    equipmentModel: 'DUO-150',
    quantityTotal: 15,
    price: 280,
    contactPerson: 'אבי גולן',
    storage: { row: 'B', shelf: '1', cell: '02' }
  },

  // LiveU Kits
  {
    name: 'LiveU LU800 Production Unit',
    category: 'liveu_kits',
    company: 'LiveU',
    equipmentModel: 'LU800',
    quantityTotal: 4,
    price: 8000,
    contactPerson: 'רונן שמיר',
    storage: { row: 'C', shelf: '1', cell: '01' }
  },
  {
    name: 'LiveU LU300S Compact Unit',
    category: 'liveu_kits',
    company: 'LiveU',
    equipmentModel: 'LU300S',
    quantityTotal: 6,
    price: 4500,
    contactPerson: 'רונן שמיר',
    storage: { row: 'C', shelf: '1', cell: '02' }
  },

  // Unity Kits
  {
    name: 'Unity Cloud Platform Kit',
    category: 'unity_kits',
    company: 'Unity Technologies',
    equipmentModel: 'Cloud Production Kit',
    quantityTotal: 3,
    price: 12000,
    contactPerson: 'טל ברק',
    storage: { row: 'D', shelf: '1', cell: '01' }
  },

  // Monitors
  {
    name: 'SmallHD 703 UltraBright Monitor',
    category: 'monitors',
    company: 'SmallHD',
    equipmentModel: '703 UltraBright',
    quantityTotal: 8,
    price: 2495,
    contactPerson: 'שרה לוי',
    storage: { row: 'E', shelf: '1', cell: '01' }
  },
  {
    name: 'Atomos Shogun 7 Monitor Recorder',
    category: 'monitors',
    company: 'Atomos',
    equipmentModel: 'Shogun 7',
    quantityTotal: 5,
    price: 1299,
    contactPerson: 'שרה לוי',
    storage: { row: 'E', shelf: '1', cell: '02' }
  },

  // Headphones
  {
    name: 'Sony MDR-7506 Professional',
    category: 'headphones',
    company: 'Sony',
    equipmentModel: 'MDR-7506',
    quantityTotal: 25,
    price: 100,
    contactPerson: 'משה כהן',
    storage: { row: 'F', shelf: '1', cell: '01' }
  },
  {
    name: 'Sennheiser HD 280 PRO',
    category: 'headphones',
    company: 'Sennheiser',
    equipmentModel: 'HD 280 PRO',
    quantityTotal: 20,
    price: 99,
    contactPerson: 'משה כהן',
    storage: { row: 'F', shelf: '1', cell: '02' }
  },

  // Stabilizers
  {
    name: 'DJI Ronin 4D',
    category: 'stabilizers',
    company: 'DJI',
    equipmentModel: 'Ronin 4D',
    quantityTotal: 3,
    price: 7199,
    contactPerson: 'עמית רוזן',
    storage: { row: 'G', shelf: '1', cell: '01' }
  },
  {
    name: 'Steadicam Shadow',
    category: 'stabilizers',
    company: 'Tiffen',
    equipmentModel: 'Shadow',
    quantityTotal: 2,
    price: 4500,
    contactPerson: 'עמית רוזן',
    storage: { row: 'G', shelf: '1', cell: '02' }
  },

  // Cards
  {
    name: 'CFexpress Type B Card 512GB',
    category: 'cards',
    company: 'SanDisk',
    equipmentModel: 'Extreme PRO',
    quantityTotal: 30,
    price: 499,
    contactPerson: 'נועה דוד',
    storage: { row: 'H', shelf: '1', cell: '01' }
  },
  {
    name: 'SD UHS-II Card 256GB',
    category: 'cards',
    company: 'Lexar',
    equipmentModel: 'Professional 2000x',
    quantityTotal: 40,
    price: 149,
    contactPerson: 'נועה דוד',
    storage: { row: 'H', shelf: '1', cell: '02' }
  },

  // Adapters
  {
    name: 'SDI to HDMI Converter',
    category: 'adapters',
    company: 'Blackmagic Design',
    equipmentModel: 'Micro Converter',
    quantityTotal: 15,
    price: 49,
    contactPerson: 'יונתן גרין',
    storage: { row: 'I', shelf: '1', cell: '01' }
  },
  {
    name: 'Thunderbolt 3 to SDI Adapter',
    category: 'adapters',
    company: 'AJA',
    equipmentModel: 'T-TAP Pro',
    quantityTotal: 10,
    price: 295,
    contactPerson: 'יונתן גרין',
    storage: { row: 'I', shelf: '1', cell: '02' }
  },

  // Matrix Components
  {
    name: 'Video Router 32x32',
    category: 'matrix_components',
    company: 'Ross Video',
    equipmentModel: 'Ultrix',
    quantityTotal: 2,
    price: 15000,
    contactPerson: 'אורי פלד',
    storage: { row: 'J', shelf: '1', cell: '01' }
  },
  {
    name: 'Audio Matrix 16x16',
    category: 'matrix_components',
    company: 'Evertz',
    equipmentModel: 'EQX16',
    quantityTotal: 2,
    price: 8000,
    contactPerson: 'אורי פלד',
    storage: { row: 'J', shelf: '1', cell: '02' }
  }
];

async function seedEquipment() {
  try {
    // Connect to MongoDB
    await connectMongoose();
    console.log('🔗 Connected to MongoDB');

    // Clear existing equipment (optional - comment out if you want to keep existing data)
    await Equipment.deleteMany({});
    console.log('🗑️  Cleared existing equipment data');

    // Seed equipment
    for (const equipmentData of sampleEquipment) {
      // Generate barcode
      const barcode = await generateBarcode(equipmentData.category);

      // Create equipment with generated barcode
      const equipment = new Equipment({
        ...equipmentData,
        barcode,
        status: 'available',
        condition: 'good',
        quantityAvailable: equipmentData.quantityTotal,
        quantityAssigned: 0,
        purchaseDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000), // Random date within last year
        warrantyExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        currentLocation: 'מחסן ראשי'
      });

      await equipment.save();
      console.log(`✅ Created equipment: ${equipment.name} (${equipment.barcode})`);
    }

    console.log(`\n🎉 Successfully seeded ${sampleEquipment.length} equipment items!`);

    // Display category summary
    const categorySummary = await Equipment.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$quantityTotal' }
        }
      }
    ]);

    console.log('\n📊 Equipment Summary by Category:');
    categorySummary.forEach(cat => {
      const categoryName = EQUIPMENT_CATEGORIES[cat._id as keyof typeof EQUIPMENT_CATEGORIES] || cat._id;
      console.log(`   ${categoryName}: ${cat.count} types, ${cat.totalQuantity} total units`);
    });

  } catch (error) {
    console.error('❌ Error seeding equipment:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the seeder
seedEquipment(); 