import React, { useEffect, useRef } from 'react';

interface AdSenseProps {
  adSlot: string;
  adFormat?: 'auto' | 'fluid' | 'rectangle' | 'vertical' | 'horizontal';
  fullWidthResponsive?: boolean;
  className?: string;
}

declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

const AdSense: React.FC<AdSenseProps> = ({ 
  adSlot, 
  adFormat = 'auto', 
  fullWidthResponsive = true,
  className = ""
}) => {
  const adRef = useRef<HTMLModElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;

    const timer = setTimeout(() => {
      if (!adRef.current) return;
      
      // Check if the element is visible and has width
      const { offsetWidth } = adRef.current;
      if (offsetWidth === 0) return;

      // Check if already initialized by AdSense (it adds data-adsbygoogle-status)
      if (adRef.current.getAttribute('data-adsbygoogle-status') === 'done') return;

      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        initialized.current = true;
      } catch (e) {
        console.error("AdSense error:", e);
      }
    }, 500); // Give it some time to render and calculate layout

    return () => clearTimeout(timer);
  }, [adSlot]);

  const clientId = import.meta.env.VITE_ADSENSE_CLIENT_ID || "7656082251156550";

  return (
    <div className={`adsense-container my-8 overflow-hidden rounded-2xl glass border border-white/10 ${className}`}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block', minWidth: '250px', minHeight: '90px' }}
        data-ad-client={`ca-pub-${clientId}`}
        data-ad-slot={adSlot}
        data-ad-format={adFormat}
        data-full-width-responsive={fullWidthResponsive.toString()}
      />
    </div>
  );
};

export default AdSense;
