import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  limit 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { CampaignAsset, LedgerEntry, AuditLog } from '../types';

// Save campaign asset to Firestore
export async function saveCampaignAssetToFirestore(asset: CampaignAsset) {
  const path = `campaignAssets/${asset.id}`;
  try {
    const userId = auth.currentUser?.uid || 'anonymous';
    await setDoc(doc(db, 'campaignAssets', asset.id), {
      ...asset,
      userId,
      createdAt: asset.scheduledTime || new Date().toISOString()
    });
    console.log(`Successfully persisted asset ${asset.id} to Firestore.`);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Fetch user's campaign assets
export async function fetchCampaignAssetsFromFirestore(): Promise<CampaignAsset[]> {
  const path = 'campaignAssets';
  try {
    const snapshot = await getDocs(collection(db, path));
    const assets: CampaignAsset[] = [];
    snapshot.forEach(docSnap => {
      assets.push(docSnap.data() as CampaignAsset);
    });
    return assets;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

// Subscribe to real-time campaign assets
export function subscribeToCampaignAssets(callback: (assets: CampaignAsset[]) => void) {
  const path = 'campaignAssets';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const assets: CampaignAsset[] = [];
      snapshot.forEach(docSnap => {
        assets.push(docSnap.data() as CampaignAsset);
      });
      callback(assets);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

// Save Ledger entry
export async function saveLedgerEntryToFirestore(entry: LedgerEntry) {
  const path = `ledgerEntries/${entry.id}`;
  try {
    const userId = auth.currentUser?.uid || 'anonymous';
    await setDoc(doc(db, 'ledgerEntries', entry.id), {
      ...entry,
      userId
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Save Audit log entry
export async function saveAuditLogToFirestore(log: AuditLog) {
  const path = `auditLogs/${log.id}`;
  try {
    const userId = auth.currentUser?.uid || 'anonymous';
    await setDoc(doc(db, 'auditLogs', log.id), {
      ...log,
      userId
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
