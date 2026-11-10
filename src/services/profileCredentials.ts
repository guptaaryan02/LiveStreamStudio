import type { StreamProfile } from '../types';

// Persist profile metadata and the storage choice, never the credential itself.
// Use the same boundary when restoring old exports/storage containing a key.
export const profilesWithoutKeys = (profiles: StreamProfile[]): StreamProfile[] =>
  profiles.map((profile) => ({...profile, streamKey:''}));
