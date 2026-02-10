/**
 * Data Sync V3
 *
 * Rebuild of SFR property data sync with a slower, more deliberate design.
 * Takes the same parameters as dataSync (V2) for compatibility: msa, api key,
 * api url, today's date, excluded addresses, and city code.
 */

import { db } from "server/storage";
import { sfrSyncState } from "../../database/schemas/sync.schema";
import { eq } from "drizzle-orm";
import { normalizeDateToYMD } from "server/utils/normalization";

const DEFAULT_START_DATE = "2025-12-03";

export interface SyncMSAV3Params {
  msa: string;
  cityCode: string;
  API_KEY: string;
  API_URL: string;
  today: string;
  excludedAddresses?: string[];
}

/**
 * Row from sfr_sync_state (id, msa, last_sale_date, last_recording_date,
 * total_records_synced, last_sync_at, created_at) plus derived date range.
 * Rows are added manually per MSA; we only read and later update via persistSyncState.
 */
export interface SyncStateByMSA {
  id: number;
  msa: string;
  /** Raw last_sale_date from DB (null if never synced). */
  lastSaleDate: Date | string | null;
  /** Raw last_recording_date from DB. */
  lastRecordingDate: Date | string | null;
  totalRecordsSynced: number;
  lastSyncAt: Date | null;
  createdAt: Date | null;
  /** Start of date range for this run (normalized last_sale_date or DEFAULT_START_DATE). */
  minSaleDate: string;
}

export interface SyncMSAV3Result {
  success: boolean;
  msa: string;
  message?: string;
  /** Sync state from sfr_sync_state so we know which dates we're working with. */
  syncState?: SyncStateByMSA;
}

/**
 * Pull last_sale_date and other sfr_sync_state fields for the given MSA.
 * We do not insert: there is one row per MSA, added manually when adding new MSAs.
 * Saves are done via persistSyncState in dataSyncHelpers (update by id: lastSaleDate,
 * totalRecordsSynced, lastSyncAt). Throws if no row exists for the MSA.
 */
export async function getSyncStateByMSA(msa: string): Promise<SyncStateByMSA> {
  const rows = await db
    .select()
    .from(sfrSyncState)
    .where(eq(sfrSyncState.msa, msa))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(
      `No sfr_sync_state row for MSA: ${msa}. Add a row manually when adding a new MSA.`
    );
  }

  const row = rows[0];
  const minSaleDate = normalizeDateToYMD(row.lastSaleDate) ?? DEFAULT_START_DATE;
  return {
    id: row.id,
    msa: row.msa,
    lastSaleDate: row.lastSaleDate,
    lastRecordingDate: row.lastRecordingDate,
    totalRecordsSynced: row.totalRecordsSynced ?? 0,
    lastSyncAt: row.lastSyncAt,
    createdAt: row.createdAt,
    minSaleDate,
  };
}

/**
 * Sync SFR data for a single MSA (V3).
 * Same parameters as syncMSAV2 for drop-in compatibility.
 */
export async function dataSyncV3(params: SyncMSAV3Params): Promise<SyncMSAV3Result> {
  const { msa, cityCode, API_KEY, API_URL, today, excludedAddresses = [] } = params;

  // -------------------------------------------------------------------------
  // Pull sfr_sync_state by MSA so we know which dates we're working with
  // -------------------------------------------------------------------------
  const syncState = await getSyncStateByMSA(msa);

  console.log(`[${cityCode} SYNC V3] sfr_sync_state: id=${syncState.id} last_sale_date=${syncState.lastSaleDate ?? "null"} last_recording_date=${syncState.lastRecordingDate ?? "null"} total_records_synced=${syncState.totalRecordsSynced} → date range ${syncState.minSaleDate} to ${today}`);

  return {
    success: true,
    msa,
    message: `Sync state loaded: working with dates ${syncState.minSaleDate} → ${today}`,
    syncState,
  };
}
