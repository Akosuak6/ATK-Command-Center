'use client';

import dynamic from 'next/dynamic';
import { Boot } from '../src/components/Boot';

// The whole app runs in the browser: its data lives in IndexedDB on the device and syncs with Neon,
// and pages switch by the #/section/page address, so moving around works offline.
const Shell = dynamic(() => import('../src/Shell'), { ssr: false, loading: () => <Boot /> });

export default function Page() {
  return <Shell />;
}
