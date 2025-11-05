// Renderer process script
// This file can be used for any client-side functionality if needed

document.addEventListener('DOMContentLoaded', () => {
  console.log('Placcon Launcher loaded');
 
  // Add any custom functionality here if needed
  // For example, custom styling, event handlers, etc.
  
  // Safe Serial API wrapper
  window.safeSerialAPI = {
    requestPort: async (options) => {
      try {
        if ('serial' in navigator) {
          const port = await navigator.serial.requestPort(options);
          return port;
        } else {
          console.warn('Serial API not supported');
          return null;
        }
      } catch (error) {
        console.warn('Serial port selection failed:', error.message);
        // Don't throw error, just return null
        return null;
      }
    },
    
    getPorts: async () => {
      try {
        if ('serial' in navigator) {
          return await navigator.serial.getPorts();
        } else {
          return [];
        }
      } catch (error) {
        console.warn('Failed to get serial ports:', error.message);
        return [];
      }
    },
    
    connect: async (port, options) => {
      try {
        if (port && typeof port.open === 'function') {
          await port.open(options);
          return true;
        } else {
          console.warn('Invalid port or port.open not available');
          return false;
        }
      } catch (error) {
        console.warn('Failed to connect to serial port:', error.message);
        return false;
      }
    }
  };
  
  // Override the native navigator.serial.requestPort to add error handling
  if ('serial' in navigator) {
    const originalRequestPort = navigator.serial.requestPort.bind(navigator.serial);
    
    navigator.serial.requestPort = async function(options) {
      try {
        return await originalRequestPort(options);
      } catch (error) {
        console.warn('Serial port selection cancelled or failed:', error.message);
        // Return null instead of throwing to prevent app crash
        return null;
      }
    };
  }
}); 