// src/summaryPdf.ts
// Native side: render the pediatrician summary and open the share sheet.
// This becomes the Pro feature once RevenueCat lands (fail-open until then).

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { BabyProfile, VolumeUnit } from './models';
import { getAllEvents } from './db';
import { buildSummaryDays, buildSummaryHtml } from './summaryHtml';

export async function exportSummaryPdf(
  profile: BabyProfile,
  unit: VolumeUnit,
  numDays = 7,
): Promise<void> {
  const now = Date.now();
  const days = buildSummaryDays(getAllEvents(), now, numDays);
  const html = buildSummaryHtml(profile, unit, days, now);
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Pediatrician summary',
  });
}
