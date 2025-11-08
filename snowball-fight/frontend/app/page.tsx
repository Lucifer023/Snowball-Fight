import dynamic from 'next/dynamic';

// Load the canvas client-side only to avoid SSR hydration mismatches
const GameCanvas = dynamic(() => import('./components/GameCanvas'), { ssr: false });

export default function Page() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <GameCanvas />
    </div>
  );
}
