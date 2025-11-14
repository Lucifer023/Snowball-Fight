"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Button, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton } from '@chakra-ui/react';
import PlayerSetup from './PlayerSetup';
import useGameEngine from './useGameEngine';

export default function GameCanvas() {
  const [started, setStarted] = useState(false);
  const [botCount, setBotCount] = useState<number>(0);
  const [localPlayers, setLocalPlayers] = useState<number>(1);
  const [playerName, setPlayerName] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('snowball_name') || 'Player' : 'Player'));
  const [playerColor, setPlayerColor] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('snowball_color') || '#2f9cff' : '#2f9cff'));
  const [mounted, setMounted] = useState(false);
  const [homeLeaderboard, setHomeLeaderboard] = useState<Record<string, number> | null>(null);
  const [showHomeLeaderboard, setShowHomeLeaderboard] = useState(false);
  const [roundWinner, setRoundWinner] = useState<string | null>(null);
  const [showEscapeConfirm, setShowEscapeConfirm] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const continueBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const { containerRef } = useGameEngine({
    started,
    playerName,
    playerColor,
    botCount,
    localPlayers,
    showEscapeConfirm,
    setShowEscapeConfirm,
    setRoundWinner,
    setHomeLeaderboard,
    setShowHomeLeaderboard,
  });

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      {!started ? (
        <PlayerSetup
          playerName={playerName}
          setPlayerName={setPlayerName}
          playerColor={playerColor}
          setPlayerColor={setPlayerColor}
          mounted={mounted}
          localPlayers={localPlayers}
          setLocalPlayers={setLocalPlayers}
          botCount={botCount}
          setBotCount={setBotCount}
          onStart={() => setStarted(true)}
          onShowLeaderboard={async () => {
            try {
              const res = await fetch((process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001') + '/leaderboard');
              if (res.ok) {
                const data = await res.json();
                setHomeLeaderboard(data || {});
                setShowHomeLeaderboard(true);
              } else {
                setHomeLeaderboard(null);
                setShowHomeLeaderboard(true);
              }
            } catch (e) {
              setHomeLeaderboard(null);
              setShowHomeLeaderboard(true);
            }
          }}
        />
      ) : (
        <div style={{ position: 'relative' }}>
          <div ref={containerRef} />
          {/* Controls legend toggle */}
          <div style={{ position: 'fixed', right: 20, top: 20, zIndex: 9999 }}>
            <button id="controlsToggle" onClick={() => setShowLegend((s: boolean) => !s)} style={{ padding: '6px 10px', background: '#333', color: '#fff', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>Controls</button>
          </div>
        </div>
      )}

      {/* Legend overlay */}
      {showLegend && (
        <div style={{ position: 'fixed', right: 16, top: 56, width: 320, background: 'rgba(0,0,0,0.85)', color: '#fff', padding: 12, borderRadius: 8, zIndex: 4000 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>Controls</strong>
            <button onClick={() => setShowLegend(false)} style={{ background: 'transparent', color: '#fff', border: 'none' }}>Close</button>
          </div>
          <div style={{ fontSize: 13, lineHeight: '1.4' }}>
            <div style={{ marginBottom: 8 }}><strong>Player 1</strong>: Move with WASD — Throw: Space or Left Click</div>
            <div><strong>Player 2</strong>: Move with Arrow Keys — Throw: Enter</div>
          </div>
        </div>
      )}

      {showHomeLeaderboard && (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ width: 360, background: '#222', color: '#fff', padding: 16, borderRadius: 8 }}>
            <h3>Leaderboard</h3>
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              {homeLeaderboard ? (
                <ol>
                  {Object.entries(homeLeaderboard).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name, sc]) => (
                    <li key={name}>{name} — {sc}</li>
                  ))}
                </ol>
              ) : (
                <div>No leaderboard data</div>
              )}
            </div>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowHomeLeaderboard(false)} style={{ padding: '6px 10px' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {roundWinner && (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ width: 520, background: '#111', color: '#fff', padding: 24, borderRadius: 10, textAlign: 'center' }}>
            <h2 style={{ marginBottom: 10 }}>Round Winner</h2>
            <div style={{ fontSize: 20, marginBottom: 16 }}>The player <strong>{roundWinner}</strong> won the snow match.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => { try { (window as any).__socket_ref?.emit('restartGame'); } catch(e){}; try { (window as any).__resumeGame?.(); } catch (e) {}; setRoundWinner(null); }} style={{ padding: '8px 12px' }}>Restart</button>
              <button onClick={() => { try { (window as any).__socket_ref?.emit('restartGame'); } catch(e){}; try { (window as any).__resumeGame?.(); } catch (e) {}; setRoundWinner(null); setStarted(false); }} style={{ padding: '8px 12px' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={showEscapeConfirm} onClose={() => setShowEscapeConfirm(false)} isCentered>
        <ModalOverlay />
        <ModalContent bg="#111" color="#fff">
          <ModalHeader>Return to Main Menu?</ModalHeader>
          <ModalCloseButton _focus={{ boxShadow: 'none', outline: 'none' }} _focusVisible={{ boxShadow: 'none' }} />
          <ModalBody>
            Are you sure you want to leave the game and return to the main menu?
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="red" mr={3} onClick={() => { setStarted(false); setShowEscapeConfirm(false); }}>
              Yes, Go to Menu
            </Button>
            <Button ref={continueBtnRef} variant="outline" colorScheme="whiteAlpha" onClick={() => setShowEscapeConfirm(false)}>No, Continue Playing</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

