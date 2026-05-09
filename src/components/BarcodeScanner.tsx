import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { localDb } from '../lib/localDb';
import { useAuth } from '../contexts/AuthContext';

interface ScannerProps {
  onScanSuccess: (result: any) => void;
  onClose: () => void;
  initialMissionId?: string | null;
}

export default function BarcodeScanner({ onScanSuccess, onClose, initialMissionId }: ScannerProps) {
  const { profile } = useAuth();
  const [mode, setMode] = useState<'checkout' | 'checkin'>('checkout');
  const [manualCode, setManualCode] = useState('');
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  
  // Checkout selection state
  const [selectedMember, setSelectedMember] = useState<string>('');
  const [selectedMission, setSelectedMission] = useState<string>(initialMissionId || '');
  const members = localDb.getUsers().filter((u: any) => u.role === 'member');
  const campaigns = localDb.getCampaigns();

  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode("reader");
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 100 } },
      (decodedText) => {
        handleCodeDetected(decodedText);
      },
      (_errorMessage) => {
        // Ignoring background errors
      }
    ).catch((err) => {
      console.warn("Camera failed to start", err);
      // Fallback to manual entry silently
    });

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [mode, selectedMember, selectedMission]); // Rebind logic if state changes

  const handleCodeDetected = (code: string) => {
    // Attempt processing the barcode
    if (mode === 'checkout' && !selectedMember) {
      setErrorStatus('Please select a member before checking out.');
      return;
    }
    
    let memberName = '';
    if (selectedMember) {
      const member = members.find((m: any) => m.id === selectedMember);
      memberName = member?.name || '';
    }

    const result = localDb.processBarcodeScan(
      code,
      mode,
      profile?.name || 'Admin',
      selectedMember,
      memberName,
      selectedMission
    );

    if (result.success) {
      setErrorStatus(null);
      // Play a beep sound on success
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRl9vT1... (beep)');
        audio.play().catch(() => {});
      } catch (e) {}
      onScanSuccess(result);
    } else {
      setErrorStatus(result.error || 'Unknown error occurred');
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleCodeDetected(manualCode.trim());
      setManualCode('');
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20
    }}>
      <div style={{
        background: '#fff', borderRadius: 24, width: '100%', maxWidth: 450, overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)', position: 'relative'
      }}>
        {/* Header */}
        <div style={{ background: '#0f172a', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>📷</span> SCANNER
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24 }}>✕</button>
        </div>

        {/* Viewport */}
        <div style={{ position: 'relative', width: '100%', height: 280, background: '#000', overflow: 'hidden' }}>
          <div id="reader" style={{ width: '100%', height: '100%' }}></div>
          
          {/* Cyberpunk Scan Overlay */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            pointerEvents: 'none', border: '40px solid rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{ 
              width: '100%', height: 100, border: '2px solid rgba(20,184,166,0.5)', 
              borderRadius: 4, position: 'relative', overflow: 'hidden',
              boxShadow: '0 0 20px rgba(20,184,166,0.2)'
            }}>
              {/* Corner Accents */}
              <div style={{ position: 'absolute', top: -2, left: -2, width: 20, height: 20, borderTop: '4px solid var(--teal)', borderLeft: '4px solid var(--teal)' }}></div>
              <div style={{ position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderTop: '4px solid var(--teal)', borderRight: '4px solid var(--teal)' }}></div>
              <div style={{ position: 'absolute', bottom: -2, left: -2, width: 20, height: 20, borderBottom: '4px solid var(--teal)', borderLeft: '4px solid var(--teal)' }}></div>
              <div style={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderBottom: '4px solid var(--teal)', borderRight: '4px solid var(--teal)' }}></div>
              
              {/* Scanning Laser */}
              <div style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                background: 'linear-gradient(to bottom, transparent 30%, rgba(20,184,166,0.2) 50%, transparent 70%)',
                animation: 'scanLaser 2.5s infinite ease-in-out'
              }}></div>
              <div style={{
                position: 'absolute', top: '50%', left: 0, width: '100%', height: 2, 
                background: 'var(--teal)', boxShadow: '0 0 15px var(--teal)',
                animation: 'scanLaser 2.5s infinite ease-in-out'
              }}></div>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px' }}>
          <style>
            {`@keyframes scanLaser { 0% { top: -100%; } 50% { top: 100%; } 100% { top: -100%; } }`}
          </style>

          {/* Mode Toggle */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {['checkout', 'checkin'].map(m => (
              <button key={m} onClick={() => setMode(m as any)} style={{
                flex: 1, padding: '12px', borderRadius: 12, fontWeight: 800, fontSize: 13,
                border: 'none', cursor: 'pointer', transition: 'all .2s',
                background: mode === m ? 'var(--dark)' : '#f1f5f9',
                color: mode === m ? '#fff' : '#64748b'
              }}>
                {m === 'checkout' ? '📤 CHECK-OUT' : '📥 CHECK-IN'}
              </button>
            ))}
          </div>

          {/* Checkout Extras */}
          {mode === 'checkout' && (
            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 16, marginBottom: 20 }}>
              <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)} style={{
                width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 12, outline: 'none'
              }}>
                <option value="">— Select Member —</option>
                {members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              
              <select value={selectedMission} onChange={e => setSelectedMission(e.target.value)} style={{
                width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #e2e8f0', outline: 'none'
              }}>
                <option value="">— Select Mission (Optional) —</option>
                {campaigns.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
          )}

          {errorStatus && (
            <div style={{ padding: '12px', background: '#fef2f2', color: '#b91c1c', borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 20, textAlign: 'center' }}>
              {errorStatus}
            </div>
          )}

          <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: 10 }}>
            <input 
              type="text" 
              placeholder="Or enter barcode manually..." 
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              style={{
                flex: 1, padding: '14px 16px', borderRadius: 12, border: '1.5px solid #e2e8f0',
                outline: 'none', fontSize: 14, fontFamily: 'monospace'
              }}
            />
            <button type="submit" style={{
              background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 12,
              padding: '0 20px', fontWeight: 800, cursor: 'pointer'
            }}>Scan</button>
          </form>
        </div>
      </div>
    </div>
  );
}
