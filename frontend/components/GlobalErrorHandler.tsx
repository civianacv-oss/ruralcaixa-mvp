'use client';

import { useEffect } from 'react';

export default function GlobalErrorHandler() {
  useEffect(() => {
    // Handle uncaught errors
    const handleError = (event: ErrorEvent) => {
      console.error('🔴 GLOBAL ERROR CAUGHT:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
        stack: event.error?.stack,
      });

      // If it's the filter error, try to recover
      if (event.message.includes('filter is not a function')) {
        console.warn('⚠️ Filter error detected - attempting recovery...');
        // Prevent the error from crashing the app
        event.preventDefault();
      }
    };

    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('🔴 UNHANDLED PROMISE REJECTION:', {
        reason: event.reason,
        promise: event.promise,
      });

      if (event.reason?.message?.includes('filter is not a function')) {
        console.warn('⚠️ Filter error in promise - attempting recovery...');
        event.preventDefault();
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null; // This component doesn't render anything
}
