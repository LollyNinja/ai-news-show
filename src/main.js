// Main entry point for the application
import { newsJingle } from './audio.js';
import { 
    handleStartNews, 
    handleQueueNews, 
    removeFromQueue, 
    stopBroadcast 
} from './broadcast/index.js';
import { toggleSettings, updateLinesValue } from './settings.js';
import { elements } from './ui.js';
import { initializeFeed, cancelBroadcastLoading } from './feed.js';
import { getAISystemStatus } from './ai-manager.js';
import { mockServerAcknowledgment } from './broadcast/communication.js';

// If backend API not found, enable fallback API endpoint handling
function setupServerApiEndpoints() {
    // Check if the server has our broadcast endpoints (in case they're not implemented)
    fetch('/api/v1/broadcast/status', { method: 'GET' })
        .then(response => {
            if (!response.ok) {
                // Server does not have API - set up client-side fallback
                console.warn('Broadcast API endpoints not detected, setting up client-side fallback');
                setupFallbackApiEndpoints();
            } else {
                console.log('Broadcast API endpoints detected and operational');
            }
        })
        .catch(error => {
            console.warn('Error checking broadcast API status, setting up fallback:', error);
            setupFallbackApiEndpoints();
        });
}

// Set up client-side fallback for missing server endpoints
function setupFallbackApiEndpoints() {
    // Mock fetch for broadcast endpoints if they don't exist on server
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        // Check if this is a broadcast API request
        if (typeof url === 'string' && url.includes('/api/v1/broadcast/')) {
            // Parse the request
            const endpoint = url.split('/').pop();
            
            // Create a mock response based on the endpoint
            if (endpoint === 'start' && options?.method === 'POST') {
                // Extract the handshake data
                const handshakeData = JSON.parse(options.body);
                
                // Create a mock acknowledgment
                const mockResponse = mockServerAcknowledgment(handshakeData);
                
                // Return a mock response Promise
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockResponse),
                    status: 200,
                    statusText: 'OK'
                });
            } 
            else if (['live', 'end'].includes(endpoint) && options?.method === 'POST') {
                // For live/end endpoints, just acknowledge receipt
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ status: 'acknowledged' }),
                    status: 200,
                    statusText: 'OK'
                });
            }
            else if (endpoint === 'status' && options?.method === 'GET') {
                // Status endpoint - always return not found in fallback mode
                return Promise.reject(new Error('Not implemented'));
            }
        }
        
        // For all other requests, use the original fetch
        return originalFetch.apply(window, arguments);
    };
    
    console.log('Fallback broadcast API endpoints configured');
}

// Initialize the application
function initializeApp() {
    // DOM elements are imported from ui.js
    
    // Handle WebSocket cleanup on page unload
    window.addEventListener('beforeunload', () => {
        // Ensure any active WebSockets are properly closed
        if (window.websim && window.websim._socket) {
            window.websim._socket.onmessage = null;
            window.websim._socket.onerror = null;
            window.websim._socket.onclose = null;
        }
    });
    
    // Set up Tab Navigation
    const studioTab = document.getElementById('tab-studio');
    const feedTab = document.getElementById('tab-feed');
    const studioContent = document.getElementById('studio-tab');
    const feedContent = document.getElementById('feed-tab');
    
    studioTab.addEventListener('click', () => {
        studioTab.classList.add('active');
        feedTab.classList.remove('active');
        studioContent.classList.add('active');
        feedContent.classList.remove('active');
    });
    
    feedTab.addEventListener('click', () => {
        feedTab.classList.add('active');
        studioTab.classList.remove('active');
        feedContent.classList.add('active');
        studioContent.classList.remove('active');
        
        // Log AI system status when switching to feed tab (for monitoring)
        console.log("Current AI system status:", getAISystemStatus());
    });
    
    // Event listeners for the broadcast studio
    elements.startButton.addEventListener('click', handleStartNews);
    elements.queueButton.addEventListener('click', handleQueueNews);
    elements.topicInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (elements.queueButton.style.display === 'block') {
                handleQueueNews();
            } else {
                handleStartNews();
            }
        }
    });
    
    elements.settingsToggle.addEventListener('click', toggleSettings);
    elements.linesPerAnchorSlider.addEventListener('input', updateLinesValue);
    
    // Initialize the news feed
    initializeFeed();
    
    // Set up API endpoints or fallbacks
    setupServerApiEndpoints();
    
    // Expose necessary functions to window (for debugging and queue item removal)
    window.stopBroadcast = stopBroadcast;
    window.removeFromQueue = removeFromQueue;
    window.getAISystemStatus = getAISystemStatus;
    window.cancelBroadcastLoading = cancelBroadcastLoading;
    
    // Add keyboard shortcut for canceling broadcasts (Escape key)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Check if we're in the feed studio view
            if (feedContent.classList.contains('active') && 
                feedContent.classList.contains('feed-studio-active')) {
                console.log("Escape key pressed - canceling broadcast");
                cancelBroadcastLoading();
            }
        }
    });
    
    // Log initial AI system status
    console.log("Initial AI system status:", getAISystemStatus());
}

// Initialize the app when the document is loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// Export necessary functions for external access
export { stopBroadcast, removeFromQueue, cancelBroadcastLoading };