// Main feed module - entry point for the feed functionality

import { getAllBroadcasts, subscribeToBroadcasts, getCurrentUser } from '../database.js';
import { feedElements } from './ui.js';
import { switchFeedView, getCurrentView, renderBroadcasts, updateFeedStatus, cleanupSanitizationObserver } from './views.js';
import { isPlayingRef, closeFeedStudio, cancelBroadcastLoading } from './actions.js';
import { sanitizeDomElements, setupSanitizationObserver } from './sanitize.js';

// Initialize feed
export function initializeFeed() {
    // Set up subtab event listeners
    feedElements.myBroadcastsTab.addEventListener('click', () => {
        switchFeedView('my');
        refreshFeed();
    });
    
    feedElements.publicBroadcastsTab.addEventListener('click', () => {
        switchFeedView('public');
        refreshFeed();
    });
    
    // Set up initial sanitization on the feed container
    if (feedElements.feedContainer) {
        sanitizeDomElements(feedElements.feedContainer);
    }
    
    // Set up sanitization on the feed studio container
    if (feedElements.feedStudioContainer) {
        sanitizeDomElements(feedElements.feedStudioContainer);
        setupSanitizationObserver(feedElements.feedStudioContainer);
    }
    
    // Initial feed load
    refreshFeed();
    
    // Handle proper WebSocket cleanup when feed component is unloaded
    let broadcastsUnsubscribe = null;
    
    // Subscribe to new broadcasts with proper access control and store unsubscribe function
    broadcastsUnsubscribe = subscribeToBroadcasts(handleBroadcastsUpdate);
    
    // Clean up subscription when component is unloaded
    window.addEventListener('beforeunload', () => {
        if (broadcastsUnsubscribe) {
            broadcastsUnsubscribe();
        }
    });
    
    // Set up refresh button
    document.getElementById('refresh-feed').addEventListener('click', refreshFeed);
    
    // Set up close studio button
    feedElements.closeButton.addEventListener('click', closeFeedStudio);
}

// Clean up resources when feed is unloaded
export function cleanupFeed() {
    cleanupSanitizationObserver();
    
    // If there are any active WebSocket connections, properly close them
    if (window.room && window.room._socket) {
        try {
            // Remove handlers that might try to enqueue after closure
            window.room._socket.onmessage = null;
        } catch (e) {
            console.error("Error cleaning up WebSocket:", e);
        }
    }
}

// Refresh the feed with proper access control
export async function refreshFeed() {
    // Show loading state
    feedElements.feedContainer.innerHTML = `
        <div class="feed-loading">
            <div class="dot-flashing"></div>
            <div>Loading news feed...</div>
        </div>
    `;
    
    try {
        // Get broadcasts based on current view with proper access control
        let broadcasts = [];
        const currentView = getCurrentView();
        
        if (currentView === 'my') {
            // My broadcasts - show ONLY broadcasts created by current user
            broadcasts = await getAllBroadcasts(true, false);
        } else {
            // Public broadcasts - show only public broadcasts
            broadcasts = await getAllBroadcasts(false, true);
        }
        
        // Double-check access control in the UI layer as well
        const currentUser = await getCurrentUser();
        if (currentView === 'my') {
            // Additional safety filter to ensure only user's own broadcasts appear
            broadcasts = broadcasts.filter(broadcast => broadcast.username === currentUser.username);
        } else {
            // Ensure only public broadcasts are shown
            broadcasts = broadcasts.filter(broadcast => broadcast.visibility === 'public');
        }
        
        // Render broadcasts
        renderBroadcasts(broadcasts, isPlayingRef);
        
        // Update status
        updateFeedStatus(broadcasts);
    } catch (error) {
        console.error("Error refreshing feed:", error);
        feedElements.feedContainer.innerHTML = `
            <div class="feed-no-items">
                Error loading broadcasts. Please try again.
            </div>
        `;
    }
}

// Handle updates to the broadcasts collection with strict access control
async function handleBroadcastsUpdate(broadcasts) {
    // Don't update if we're currently playing
    if (isPlayingRef.current && feedElements.feedTab.classList.contains('feed-studio-active')) {
        return;
    }
    
    try {
        // Filter and sort based on current view with proper access control
        let filtered = [];
        const currentUser = await getCurrentUser();
        const currentView = getCurrentView();
        
        if (currentView === 'my') {
            // My broadcasts view - ONLY show broadcasts with EXACT username match
            filtered = broadcasts.filter(broadcast => broadcast.username === currentUser.username);
        } else {
            // Public broadcasts view - only show public broadcasts
            filtered = broadcasts.filter(broadcast => broadcast.visibility === 'public');
        }
        
        // Sort by timestamp (newest first)
        filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Render the broadcasts
        renderBroadcasts(filtered, isPlayingRef);
        
        // Update status
        updateFeedStatus(filtered);
    } catch (error) {
        console.error("Error handling broadcasts update:", error);
    }
}

// Add a new broadcast to the feed with animation
export function addNewBroadcast(broadcast) {
    // Refresh the feed
    refreshFeed();
}

// Export cancelBroadcastLoading function to make it accessible to the main app
export { cancelBroadcastLoading } from './actions.js';