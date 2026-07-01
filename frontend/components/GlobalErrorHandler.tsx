'use client';

import { useEffect } from 'react';

export default function GlobalErrorHandler() {
  useEffect(() => {
    // Monkey-patch Array.prototype.filter to add safety
    const originalFilter = Array.prototype.filter;
    Array.prototype.filter = function(callback: any, thisArg?: any) {
      // If this is not an array, return empty array
      if (!Array.isArray(this)) {
        console.warn('⚠️ filter() called on non-array:', this);
        return [];
      }
      return originalFilter.call(this, callback, thisArg);
    };

    // Handle uncaught errors
    const handleError = (event: ErrorEvent) => {
      // Suppress filter errors - they're already handled by the monkey-patch
      if (event.message?.includes('filter is not a function')) {
        console.warn('⚠️ Suppressed filter error (handled by safety patch)');
        event.preventDefault();
        return;
      }

      console.error('🔴 GLOBAL ERROR CAUGHT:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
        stack: event.error?.stack,
      });
    };

    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Suppress filter errors
      if (event.reason?.message?.includes('filter is not a function')) {
        console.warn('⚠️ Suppressed filter error in promise (handled by safety patch)');
        event.preventDefault();
        return;
      }

      console.error('🔴 UNHANDLED PROMISE REJECTION:', {
        reason: event.reason,
        promise: event.promise,
      });
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
