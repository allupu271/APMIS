const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const plants = [
  { name: 'Cactus',           minMoisture: 10, maxMoisture: 25 },
  { name: 'Succulent',        minMoisture: 15, maxMoisture: 30 },
  { name: 'Snake Plant',      minMoisture: 20, maxMoisture: 40 },
  { name: 'Pothos',           minMoisture: 35, maxMoisture: 60 },
  { name: 'Peace Lily',       minMoisture: 45, maxMoisture: 70 },
  { name: 'Fern',             minMoisture: 55, maxMoisture: 80 },
  { name: 'Spider Plant',     minMoisture: 40, maxMoisture: 65 },
  { name: 'Monstera',         minMoisture: 40, maxMoisture: 65 },
  { name: 'Orchid',           minMoisture: 30, maxMoisture: 55 },
  { name: 'Aloe Vera',        minMoisture: 15, maxMoisture: 35 },
];

async function seed() {
  const collection = db.collection('plants');
  let created = 0;
  let skipped = 0;

  for (const plant of plants) {
    const id = plant.name.toLowerCase().replace(/\s+/g, '_');
    const ref = collection.doc(id);
    const snapshot = await ref.get();

    if (snapshot.exists) {
      console.log(`SKIP  ${plant.name} (already exists)`);
      skipped++;
    } else {
      await ref.set({
        ...plant,
        isDefault: true,
        createdBy: 'system',
      });
      console.log(`WRITE ${plant.name} (minMoisture: ${plant.minMoisture}%, maxMoisture: ${plant.maxMoisture}%)`);
      created++;
    }
  }

  console.log(`\nDone — ${created} created, ${skipped} skipped.`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
