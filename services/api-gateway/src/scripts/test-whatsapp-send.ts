/**
 * One-off sanity script for the WhatsApp service.
 *
 * Usage (PowerShell):
 *   $env:WHATSAPP_ACCESS_TOKEN="..."; `
 *   $env:WHATSAPP_PHONE_NUMBER_ID="..."; `
 *   npx ts-node src/scripts/test-whatsapp-send.ts +972XXXXXXXXX
 *
 * Reads credentials from env vars only; never write the token to disk.
 */

import { sendShiftAssignmentsWhatsApp } from '../services/whatsapp.service';

async function main() {
  const recipient = process.argv[2];
  if (!recipient) {
    console.error('Usage: ts-node test-whatsapp-send.ts <phone>');
    process.exit(2);
  }

  console.log(`Sending test WhatsApp to ${recipient} ...`);

  const result = await sendShiftAssignmentsWhatsApp({
    to: recipient,
    employeeName: 'עידן',
    departmentName: 'בדיקה',
    startDate: '2026-06-07',
    endDate: '2026-06-13',
    shifts: [
      {
        date: '2026-06-08',
        shiftType: 'בוקר',
        startTime: '06:00',
        endTime: '14:00',
        role: 'מפיק',
        notes: 'בדיקת חיבור WhatsApp',
      },
      {
        date: '2026-06-10',
        shiftType: 'ערב',
        startTime: '14:00',
        endTime: '22:00',
        role: 'בקרה',
      },
    ],
  });

  console.log('Success:', result);
}

main().catch((err) => {
  console.error('Failed:', err?.message || err);
  process.exit(1);
});
