// Broadcast communication module for server interaction
// Handles handshakes, acknowledgments, and logging

// Constants
const MAX_RETRY_ATTEMPTS = 3;
const HANDSHAKE_TIMEOUT_MS = 2000;
const BROADCAST_EVENTS = {
  START: 'start',
  ACK: 'ack',
  LIVE: 'live',
  END: 'end',
  ERROR: 'error'
};

// Track active broadcast sessions
let activeBroadcastId = null;
let broadcastHandshakeComplete = false;
let currentRetryCount = 0;

// Event log history for debugging
const eventLog = [];

/**
 * Log a broadcast event with details
 * @param {string} event - Event type (start, ack, live, end, error)
 * @param {object} details - Additional event details
 */
function logBroadcastEvent(event, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    event,
    timestamp,
    broadcastId: activeBroadcastId,
    details
  };
  
  console.log(`[Broadcast ${event.toUpperCase()}]`, logEntry);
  eventLog.push(logEntry);
  
  // Limit log size
  if (eventLog.length > 100) {
    eventLog.shift();
  }
}

/**
 * Initialize a new broadcast handshake with the server
 * @param {object} broadcastData - Data about the broadcast
 * @returns {Promise<object>} - Server response with acknowledgment
 */
export async function initiateBroadcastHandshake(broadcastData) {
  try {
    // Reset state for new broadcast
    currentRetryCount = 0;
    broadcastHandshakeComplete = false;
    
    // Generate unique broadcast ID if not provided
    const broadcastId = broadcastData.id || generateBroadcastId();
    activeBroadcastId = broadcastId;
    
    // Prepare handshake data
    const handshakeData = {
      broadcast_id: broadcastId,
      topic: broadcastData.topic,
      visibility: broadcastData.visibility || 'private',
      timestamp: new Date().toISOString(),
      client_info: {
        user_agent: navigator.userAgent,
        screen_width: window.innerWidth,
        screen_height: window.innerHeight
      }
    };
    
    // Log start event
    logBroadcastEvent(BROADCAST_EVENTS.START, { 
      topic: broadcastData.topic,
      attempt: currentRetryCount + 1
    });
    
    // Attempt handshake with retry logic
    return await attemptHandshake(handshakeData);
    
  } catch (error) {
    logBroadcastEvent(BROADCAST_EVENTS.ERROR, { 
      message: error.message,
      phase: 'handshake_initiation'
    });
    throw new Error(`Broadcast handshake failed: ${error.message}`);
  }
}

/**
 * Attempt handshake with retry logic
 * @param {object} handshakeData - Data to send to server
 * @returns {Promise<object>} - Server response
 */
async function attemptHandshake(handshakeData) {
  while (currentRetryCount < MAX_RETRY_ATTEMPTS) {
    try {
      // Record attempt number
      const attemptNumber = currentRetryCount + 1;
      
      // Update handshake data with retry information
      const dataWithRetry = {
        ...handshakeData,
        attempt: attemptNumber
      };
      
      // Make request with timeout
      const response = await Promise.race([
        sendHandshakeRequest(dataWithRetry),
        createTimeoutPromise(HANDSHAKE_TIMEOUT_MS)
      ]);
      
      // If we got a valid acknowledgment
      if (response && response.status === 'ack') {
        broadcastHandshakeComplete = true;
        
        // Log acknowledgment 
        logBroadcastEvent(BROADCAST_EVENTS.ACK, {
          attempt: attemptNumber,
          server_broadcast_id: response.broadcast_id
        });
        
        return response;
      }
      
      // If response was invalid but not a timeout
      throw new Error('Invalid server response');
      
    } catch (error) {
      currentRetryCount++;
      
      // Log retry attempt
      if (currentRetryCount < MAX_RETRY_ATTEMPTS) {
        logBroadcastEvent('retry', {
          attempt: currentRetryCount,
          reason: error.message,
          nextAttemptIn: `${HANDSHAKE_TIMEOUT_MS}ms`
        });
        
        // Wait briefly before retrying
        await new Promise(resolve => setTimeout(resolve, 200));
      } else {
        // Log final failure
        logBroadcastEvent(BROADCAST_EVENTS.ERROR, {
          message: 'Handshake failed after maximum retry attempts',
          last_error: error.message
        });
        
        throw new Error('Broadcast handshake failed after maximum retry attempts');
      }
    }
  }
  
  // Should never reach here due to throw in the loop, but just in case
  throw new Error('Broadcast handshake failed after all retry attempts');
}

/**
 * Send actual handshake request to server
 * @param {object} data - Handshake data
 * @returns {Promise<object>} - Server response
 */
async function sendHandshakeRequest(data) {
  try {
    // Prepare the request
    const response = await fetch('/api/v1/broadcast/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    // Check for HTTP errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server returned ${response.status}: ${errorText}`);
    }
    
    // Parse and return the response
    return await response.json();
    
  } catch (error) {
    console.error('Error during handshake request:', error);
    throw error;
  }
}

/**
 * Create a timeout promise that rejects after specified milliseconds
 * @param {number} ms - Milliseconds to wait before timing out
 * @returns {Promise<never>} - Promise that rejects after timeout
 */
function createTimeoutPromise(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Request timed out after ${ms}ms`));
    }, ms);
  });
}

/**
 * Generate a unique ID for a broadcast
 * @returns {string} - Unique broadcast ID
 */
function generateBroadcastId() {
  return 'bc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Notify server that broadcast is now live (playing)
 * @param {object} broadcastData - Data about the live broadcast
 * @returns {Promise<object>} - Server response
 */
export async function notifyBroadcastLive(broadcastData) {
  try {
    if (!activeBroadcastId) {
      throw new Error('No active broadcast ID found');
    }
    
    // Prepare live notification data
    const liveData = {
      broadcast_id: activeBroadcastId,
      topic: broadcastData.topic,
      timestamp: new Date().toISOString(),
      status: 'live',
      lines_count: broadcastData.dialogue ? broadcastData.dialogue.length : 0
    };
    
    // Log live event
    logBroadcastEvent(BROADCAST_EVENTS.LIVE, {
      topic: broadcastData.topic
    });
    
    // Send notification
    const response = await fetch('/api/v1/broadcast/live', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(liveData)
    });
    
    if (!response.ok) {
      console.warn(`Server returned ${response.status} for live notification`);
      // Don't throw error here, still continue with broadcast
    }
    
    return await response.json().catch(() => ({ status: 'acknowledged' }));
    
  } catch (error) {
    // Log error but don't disrupt broadcast playback if this fails
    console.error('Error notifying broadcast live status:', error);
    logBroadcastEvent(BROADCAST_EVENTS.ERROR, {
      message: error.message,
      phase: 'live_notification',
      recoverable: true
    });
    
    // Return a default response to continue broadcast
    return { status: 'fallback_response' };
  }
}

/**
 * Notify server that broadcast has ended
 * @param {object} stats - Statistics about the completed broadcast
 * @returns {Promise<object>} - Server response
 */
export async function notifyBroadcastEnd(stats) {
  try {
    if (!activeBroadcastId) {
      console.warn('Attempted to end broadcast but no active broadcast ID found');
      return { status: 'no_active_broadcast' };
    }
    
    // Prepare end notification data
    const endData = {
      broadcast_id: activeBroadcastId,
      timestamp: new Date().toISOString(),
      status: 'ended',
      stats: {
        ...stats,
        duration_ms: stats.duration || 0,
        successful: stats.successful !== false
      }
    };
    
    // Log end event
    logBroadcastEvent(BROADCAST_EVENTS.END, stats);
    
    // Reset state variables
    const completedBroadcastId = activeBroadcastId;
    activeBroadcastId = null;
    broadcastHandshakeComplete = false;
    
    // Send notification
    const response = await fetch('/api/v1/broadcast/end', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(endData)
    });
    
    if (!response.ok) {
      console.warn(`Server returned ${response.status} for end notification`);
      return { status: 'server_error', broadcast_id: completedBroadcastId };
    }
    
    return await response.json().catch(() => ({ 
      status: 'acknowledged',
      broadcast_id: completedBroadcastId
    }));
    
  } catch (error) {
    // Log error but don't disrupt UI if this fails
    console.error('Error notifying broadcast end:', error);
    logBroadcastEvent(BROADCAST_EVENTS.ERROR, {
      message: error.message,
      phase: 'end_notification',
      recoverable: true
    });
    
    // Clean up state variables even if notification fails
    activeBroadcastId = null;
    broadcastHandshakeComplete = false;
    
    // Return a default response to continue
    return { status: 'error_acknowledged' };
  }
}

/**
 * Check if broadcast handshake is complete
 * @returns {boolean} - True if handshake is complete
 */
export function isBroadcastHandshakeComplete() {
  return broadcastHandshakeComplete;
}

/**
 * Get current active broadcast ID
 * @returns {string|null} - Active broadcast ID or null
 */
export function getActiveBroadcastId() {
  return activeBroadcastId;
}

/**
 * Get broadcast event log
 * @returns {Array} - Array of log entries
 */
export function getBroadcastEventLog() {
  return [...eventLog];
}

/**
 * Create a mock server acknowledgment for testing
 * @param {object} handshakeData - Handshake data sent to server
 * @returns {object} - Mock server response
 */
export function mockServerAcknowledgment(handshakeData) {
  // Create a mock response that simulates server behavior
  return {
    status: 'ack',
    broadcast_id: handshakeData.broadcast_id,
    server_timestamp: new Date().toISOString(),
    message: 'Broadcast request acknowledged (mock)',
    success: true
  };
}