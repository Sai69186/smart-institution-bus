import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * OfflineBanner — listens to browser online/offline events and shows
 * a banner at the top of the screen when connectivity is lost.
 * Auto-hides 3 seconds after connection is restored.
 */
const OfflineBanner = () => {
  const [isOnline,  setIsOnline]  = useState(navigator.onLine);
  const [showBack,  setShowBack]  = useState(false);   // "back online" flash
  const [hiding,    setHiding]    = useState(false);   // triggers slide-up animation

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowBack(true);
      setHiding(false);
      // After 3s, slide the banner back up
      const t = setTimeout(() => {
        setHiding(true);
        setTimeout(() => setShowBack(false), 300); // wait for animation
      }, 3000);
      return () => clearTimeout(t);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBack(false);
      setHiding(false);
    };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Nothing to show when online and no "back" flash
  if (isOnline && !showBack) return null;

  return (
    <div className={`offline-banner${hiding ? ' hide' : ''}`}>
      {isOnline ? (
        <>
          <Wifi size={15} />
          Back online — real-time updates resumed.
        </>
      ) : (
        <>
          <WifiOff size={15} />
          No internet connection — showing cached data. Some features may be unavailable.
        </>
      )}
    </div>
  );
};

export default OfflineBanner;
