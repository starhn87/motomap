import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { startPlaceCatalogSync } from '@/lib/placeCatalogSync';

export default function PlaceCatalogSync() {
  const client = useQueryClient();
  useEffect(() => startPlaceCatalogSync(client), [client]);
  return null;
}
